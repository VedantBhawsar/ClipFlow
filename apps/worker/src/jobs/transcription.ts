/**
 * Worker job: transcribe an extracted audio file with AssemblyAI.
 *
 * Flow:
 *   1. Resolve the Video row.
 *   2. Idempotency: skip if `transcriptS3Key` is already set.
 *   3. Validate required inputs (audio exists, API key configured).
 *   4. Status flip → TRANSCRIBING (idempotent — ingest already set this).
 *   5. Stream audio from S3 to a temp file.
 *   6. Submit to AssemblyAI; poll until terminal.
 *   7. Persist transcript JSON + auto-chapters JSON to S3.
 *   8. Update the Video row with `transcriptS3Key`,
 *      `transcriptLanguage`, `transcriptDurationMs`, and status =
 *      `GENERATING`. The next-slice `generate` job will read these.
 *
 * Failure handling:
 *   - Permanent (`AAI_AUTH`, `AAI_QUOTA`, `AAI_BAD_REQUEST`,
 *     `AAI_TRANSCRIPT_ERROR`, `AAI_AUDIO_MISSING`) → set status =
 *     `FAILED` with a `[code] message` failureReason, publish SSE
 *     `STATUS_UPDATE` + `ERROR`, return without throwing.
 *   - Transient (`AAI_UPSTREAM`, `AAI_POLL_TIMEOUT`,
 *     `AAI_RUNTIME_ERROR`, generic S3 hiccup) → rethrow so BullMQ's
 *     exponential backoff retries.
 *
 * Idempotency:
 *   - `jobId` is `transcribe-${videoId}` (set by the caller) so
 *     duplicate enqueues dedupe.
 *   - Inside the worker: `transcriptS3Key` non-null → return early.
 *
 * NOTE on `generate` handoff: when this slice lands, step 7 of the plan
 * (the `generate` LLM job) does not exist yet. We flip the row to
 * `GENERATING` and persist the transcript; the `generate` queue's
 * startup-recovery pass will pick up orphaned `GENERATING` rows on
 * its first boot.
 */
import type { Job } from "bullmq";
import type { Env } from "@clipflow/config";
import { prisma } from "@clipflow/db";
import {
  buildS3Config,
  getObjectStream,
  getS3Client,
  putObjectFromFile,
} from "@clipflow/s3";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  transcribeAudioFile,
  type AaiTranscript,
} from "../lib/transcription/assemblyai.js";
import { classifyAaiError } from "../lib/transcription/assemblyai-errors.js";
import type { Logger } from "../config/logger.js";
import type { EventPublisher } from "../lib/events.js";

export interface TranscriptionJobData {
  videoId: string;
}

export interface ProcessContext {
  env: Env;
  logger: Logger;
  events?: EventPublisher;
  /**
   * Enqueue a follow-up `generate` job for the given video. Set by
   * the worker at boot after the generate queue is constructed.
   * Optional so unit tests that exercise only the transcription
   * path can pass a no-op / vi.fn() mock.
   */
  enqueueGenerate?: (videoId: string) => Promise<void>;
}

const TMP_PREFIX = join(tmpdir(), "clipflow-transcribe-");
const JSON_CONTENT_TYPE = "application/json";

const nowIso = (): string => new Date().toISOString();

/**
 * Process one `transcription` BullMQ job.
 */
export const processTranscriptionJob = async (
  job: Job<TranscriptionJobData>,
  ctx: ProcessContext,
): Promise<void> => {
  const { videoId } = job.data;
  ctx.logger.info(
    { jobId: job.id, videoId, attempt: job.attemptsMade + 1 },
    "Starting transcription job",
  );

  // ---- Resolve the row ----
  const video = await prisma.video
    .findUnique({
      where: { id: videoId },
      select: {
        userId: true,
        s3KeyAudio: true,
        transcriptS3Key: true,
        status: true,
      },
    })
    .catch(() => null);

  if (!video) {
    ctx.logger.warn({ videoId }, "Video row missing — skipping transcription");
    return;
  }

  // ---- Idempotency: already-transcribed rows skip ----
  if (video.transcriptS3Key) {
    ctx.logger.info(
      { videoId, transcriptS3Key: video.transcriptS3Key },
      "Video already has a transcript — skipping (idempotent)",
    );
    return;
  }

  const userId = video.userId;
  const canPublish = !!userId && !!ctx.events;

  // ---- Permanent: audio not extracted yet ----
  //
  // We treat this as a permanent failure rather than a transient retry
  // because there's nothing the transcription job can do without audio.
  // If audio was actually extracted but the row was reset, the ingest
  // job's idempotency guard will re-run silently — leaving this row
  // stuck at UPLOADED with audio. Startup-recovery handles that path.
  if (!video.s3KeyAudio) {
    const reason =
      "[AAI_AUDIO_MISSING] Audio extraction didn't complete before transcription was attempted.";
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "FAILED", failureReason: reason },
    });

    if (canPublish) {
      void ctx.events!.publish({
        type: "STATUS_UPDATE",
        videoId,
        userId: userId!,
        status: "FAILED",
        timestamp: nowIso(),
      });
      void ctx.events!.publish({
        type: "ERROR",
        videoId,
        userId: userId!,
        error: reason,
        timestamp: nowIso(),
      });
    }
    ctx.logger.warn(
      { videoId, status: video.status },
      "Audio key missing — marking FAILED",
    );
    return;
  }

  // ---- Permanent: ASSEMBLYAI_API_KEY not configured ----
  //
  // This is an operator-config issue, not a per-job failure. Surface
  // it explicitly so the dashboard surfaces it as `[AAI_AUTH]` rather
  // than a generic transcript error.
  if (!ctx.env.ASSEMBLYAI_API_KEY) {
    const reason =
      "[AAI_AUTH] ASSEMBLYAI_API_KEY is not configured in the worker environment.";
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "FAILED", failureReason: reason },
    });

    if (canPublish) {
      void ctx.events!.publish({
        type: "STATUS_UPDATE",
        videoId,
        userId: userId!,
        status: "FAILED",
        timestamp: nowIso(),
      });
      void ctx.events!.publish({
        type: "ERROR",
        videoId,
        userId: userId!,
        error: reason,
        timestamp: nowIso(),
      });
    }
    ctx.logger.error({ videoId }, "ASSEMBLYAI_API_KEY not configured — permanent fail");
    return;
  }

  // ---- Status flip: ensure TRANSCRIBING (idempotent — ingest already set this) ----
  if (video.status !== "TRANSCRIBING") {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "TRANSCRIBING", failureReason: null },
    });
    if (canPublish) {
      void ctx.events!.publish({
        type: "STATUS_UPDATE",
        videoId,
        userId: userId!,
        status: "TRANSCRIBING",
        timestamp: nowIso(),
      });
    }
  }

  // ---- Temp dir, cleaned up in `finally` ----
  const tempDir = await mkdtemp(TMP_PREFIX);
  const audioPath = join(tempDir, "audio.mp3");

  try {
    const s3Config = buildS3Config(ctx.env);
    const s3Client = getS3Client(s3Config);

    // ---- 1. Stream audio from S3 to temp file ----
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId: userId!,
        progress: 10,
        stage: "Downloading audio",
        timestamp: nowIso(),
      });
    }

    ctx.logger.info(
      { videoId, s3Key: video.s3KeyAudio, tempDir },
      "Downloading audio from S3",
    );
    const { body } = await getObjectStream(s3Client, s3Config, video.s3KeyAudio);
    // AWS SDK v3 returns a Web ReadableStream; `transformToWebStream`
    // gives us a Node-compatible stream we can pipeline into a write
    // stream. Same dance the ingest job uses.
    const webStream = (
      body as unknown as { transformToWebStream(): NodeJS.ReadableStream }
    ).transformToWebStream();
    await pipeline(
      Readable.fromWeb(
        webStream as unknown as Parameters<typeof Readable.fromWeb>[0],
      ),
      createWriteStream(audioPath),
    );
    ctx.logger.info({ videoId }, "Downloaded audio to temp");

    // ---- 2. Transcribe via AssemblyAI ----
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId: userId!,
        progress: 35,
        stage: "Transcribing with AssemblyAI",
        timestamp: nowIso(),
      });
    }

    let transcript: AaiTranscript;
    try {
      transcript = await transcribeAudioFile(
        ctx.env,
        ctx.env.ASSEMBLYAI_API_KEY,
        audioPath,
      );
    } catch (err) {
      const classified = classifyAaiError(err);
      if (classified.kind === "permanent") {
        const reason = `[${classified.reasonCode}] ${classified.message}`;
        await prisma.video.update({
          where: { id: videoId },
          data: { status: "FAILED", failureReason: reason },
        });
        if (canPublish) {
          void ctx.events!.publish({
            type: "STATUS_UPDATE",
            videoId,
            userId: userId!,
            status: "FAILED",
            timestamp: nowIso(),
          });
          void ctx.events!.publish({
            type: "ERROR",
            videoId,
            userId: userId!,
            error: reason,
            timestamp: nowIso(),
          });
        }
        ctx.logger.warn(
          {
            videoId,
            reasonCode: classified.reasonCode,
            message: classified.message,
          },
          "Transcription failed permanently; not retrying",
        );
        return;
      }

      // Transient: rethrow for BullMQ backoff.
      ctx.logger.warn(
        {
          videoId,
          reasonCode: classified.reasonCode,
          message: classified.message,
        },
        "Transcription failed transiently; BullMQ will retry",
      );
      throw new Error(`[${classified.reasonCode}] ${classified.message}`);
    }

    ctx.logger.info(
      {
        videoId,
        languageCode: transcript.languageCode,
        durationMs: transcript.durationMs,
        wordCount: transcript.words.length,
        chapterCount: transcript.chapters.length,
      },
      "AssemblyAI transcription complete",
    );

    // ---- 3. Persist transcript + auto-chapters JSON ----
    //
    // Two artefacts land in S3:
    //   - `transcript.json` — the full AaiTranscript shape. The future
    //     `generate` LLM job reads this verbatim; caching the full
    //     payload keeps the LLM job free to re-read without re-running
    //     AssemblyAI.
    //   - `chapters.auto.json` — just the `chapters` array, in case a
    //     future LLM-free path wants to use AssemblyAI's chapter
    //     boundaries directly (e.g. for an "auto-chapters only" tier).
    //
    // We write to temp files first then upload via `putObjectFromFile`
    // (which expects a file path, not a buffer). The same temp dir
    // gets cleaned up in the outer `finally`.
    const transcriptS3Key = `videos/${videoId}/transcript.json`;
    const chaptersS3Key = `videos/${videoId}/chapters.auto.json`;
    const transcriptPath = join(tempDir, "transcript.json");
    const chaptersPath = join(tempDir, "chapters.auto.json");
    await writeFile(transcriptPath, JSON.stringify(transcript, null, 2));
    await writeFile(chaptersPath, JSON.stringify(transcript.chapters, null, 2));

    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId: userId!,
        progress: 75,
        stage: "Uploading transcript",
        timestamp: nowIso(),
      });
    }

    await putObjectFromFile(
      s3Client,
      s3Config,
      transcriptS3Key,
      transcriptPath,
      JSON_CONTENT_TYPE,
    );
    await putObjectFromFile(
      s3Client,
      s3Config,
      chaptersS3Key,
      chaptersPath,
      JSON_CONTENT_TYPE,
    );
    ctx.logger.info(
      { videoId, transcriptS3Key, chaptersS3Key },
      "Uploaded transcript + chapters to S3",
    );

    // ---- 4. Update row → GENERATING ----
    //
    // `transcriptS3Key` is the single source of truth for "did
    // transcription land?" — the idempotency check at the top reads it
    // and short-circuits if it's already set, so a worker crash between
    // the S3 upload above and this DB write will re-upload on retry
    // (S3 PutObject is idempotent on the same key+body).
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId: userId!,
        progress: 95,
        stage: "Finalizing",
        timestamp: nowIso(),
      });
    }

    await prisma.video.update({
      where: { id: videoId },
      data: {
        transcriptS3Key,
        transcriptLanguage: transcript.languageCode,
        transcriptDurationMs: transcript.durationMs,
        status: "GENERATING",
      },
    });

    if (canPublish) {
      void ctx.events!.publish({
        type: "STATUS_UPDATE",
        videoId,
        userId: userId!,
        status: "GENERATING",
        timestamp: nowIso(),
      });
    }

    // ---- 5. Enqueue the generate follow-up ----
    //
    // Done AFTER the DB update so a crash between enqueue and DB
    // update doesn't leave a stranded job (the job would have no
    // transcript to read). The deterministic jobId (`generate-${id}`)
    // dedupes against any stale recovery re-enqueue. Mirrors the
    // pattern the video-ingest job uses to hand off to transcription.
    if (ctx.enqueueGenerate) {
      try {
        await ctx.enqueueGenerate(videoId);
        ctx.logger.info(
          { videoId },
          "Enqueued generate follow-up job",
        );
      } catch (enqueueErr) {
        // If the enqueue itself fails (Redis blip), rethrow so
        // BullMQ retries the whole transcription job. The next
        // attempt will short-circuit on the transcriptS3Key
        // idempotency check and re-enqueue the generate.
        ctx.logger.error(
          {
            videoId,
            err: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
          },
          "Failed to enqueue generate follow-up; rethrowing for retry",
        );
        throw enqueueErr;
      }
    } else {
      ctx.logger.info(
        { videoId },
        "generate enqueue not wired — leaving row at GENERATING for next slice",
      );
    }

    ctx.logger.info(
      {
        videoId,
        transcriptS3Key,
        chaptersS3Key,
        transcriptLanguage: transcript.languageCode,
        transcriptDurationMs: transcript.durationMs,
      },
      "Transcription job completed",
    );
  } catch (err) {
    // Anything not classified as permanent above is transient by default.
    // Log and rethrow so BullMQ applies backoff. The `failed` listener
    // in queue.ts handles exhaustion → FAILED.
    ctx.logger.error(
      {
        videoId,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Transcription failed unexpectedly; will retry",
    );
    throw err;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Best-effort cleanup — a leftover temp dir is harmless
    });
  }
};