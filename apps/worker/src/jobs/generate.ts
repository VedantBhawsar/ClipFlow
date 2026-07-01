/**
 * Worker job: LLM-driven chapter + summary generation.
 *
 * Flow:
 *   1. Resolve the Video row.
 *   2. Idempotency: skip if `chaptersJson` is already set.
 *   3. Validate required inputs (transcript in S3, LLM key configured).
 *   4. Status flip → ensure GENERATING (idempotent — transcription
 *      already set this).
 *   5. Stream transcript JSON from S3 → temp file.
 *   6. Parse the AaiTranscript (kept verbatim from step 4 so the
 *      LLM has word-level timings + auto-chapter anchors).
 *   7. Build the select-highlights prompt.
 *   8. Call the LLM via `validateWithRetry` (parse + retry, up to 3
 *      attempts, with a re-prompt that includes the specific complaint
 *      on parse failure).
 *   9. Persist `{ summary, chapters[] }` to `chaptersJson`.
 *  10. Update the row status to `READY_FOR_REVIEW` and publish SSE.
 *
 * Failure handling:
 *   - Permanent (`LLM_AUTH`, `LLM_SCOPE`, `LLM_MODEL_NOT_FOUND`,
 *     `LLM_BAD_REQUEST`, `LLM_BAD_OUTPUT`, `GEN_TRANSCRIPT_MISSING`,
 *     `GEN_TRANSCRIPT_PARSE_ERROR`) → set status = FAILED with a
 *     `[code] message` failureReason, publish SSE STATUS_UPDATE +
 *     ERROR, return without throwing.
 *   - Transient (`LLM_RATE_LIMIT`, `LLM_UPSTREAM`, `LLM_TIMEOUT`,
 *     `LLM_NETWORK`, S3 hiccup) → rethrow so BullMQ's exponential
 *     backoff retries.
 *
 * Idempotency:
 *   - `jobId` is `generate-${videoId}` so duplicate enqueues dedupe.
 *   - Inside the worker: `chaptersJson` non-null → return early.
 *
 * What this slice does NOT do (per the v1.5 scope agreed with the
 *   user):
 *   - Frame extraction at the LLM-picked highlight moments (thumbline
 *     work, deferred).
 *   - Writing the chapters to the YouTube description (publish work,
 *     deferred).
 *   - The user-facing review screen (deferred).
 *
 *   `chaptersJson` carries the canonical `{ summary, chapters }` shape
 *   for the publish path to read; the row's existing
 *   `highlightsS3Prefix` / `highlightsCount` columns stay null until
 *   the thumbline slice lands.
 */
import type { Job } from "bullmq";
import type { Env } from "@clipflow/config";
import { prisma } from "@clipflow/db";
import {
  buildS3Config,
  getObjectStream,
  getS3Client,
} from "@clipflow/s3";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  OpenAICompatLlmClient,
  buildSelectHighlightsPrompt,
  classifyLlmError,
  validateWithRetry,
  type AaiTranscript,
} from "../lib/llm/index.js";
import type { Logger } from "../config/logger.js";
import type { EventPublisher } from "../lib/events.js";

export interface GenerateJobData {
  videoId: string;
}

export interface ProcessContext {
  env: Env;
  logger: Logger;
  events?: EventPublisher;
}

const TMP_PREFIX = join(tmpdir(), "clipflow-generate-");

const nowIso = (): string => new Date().toISOString();

/**
 * Max characters of the transcript we send to the LLM. The transcript
 * we read from S3 is the full AssemblyAI JSON including the verbatim
 * `text` field; for a 30-min video that can run ~50 KB. Llama 3.1 70B
 * has a 128 k context window, but in practice we want to keep the
 * input under 60 kB to leave room for the system prompt + output.
 */
const MAX_TRANSCRIPT_CHARS = 60_000;

/**
 * Truncate the transcript text to `max` characters on a word boundary
 * so we don't chop a word in half. Adds a marker so the LLM knows
 * it's been cut.
 */
const truncateTranscript = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cleaned = lastSpace > max * 0.8 ? slice.slice(0, lastSpace) : slice;
  return `${cleaned}\n\n[…transcript truncated at ${max} characters…]`;
};

/**
 * Build the chaptersJson payload we persist on the row. The shape is
 * `{ summary, chapters[] }` — see the `chaptersJson` field comment in
 * `packages/db/schema.prisma` for the contract. The publish path
 * reads `chaptersJson.chapters` to write YouTube chapters and
 * `chaptersJson.summary` to seed the description.
 */
interface ChaptersJson {
  summary: string;
  chapters: { startMs: number; title: string }[];
}

const toChaptersJson = (llmOutput: {
  summary: string;
  chapters: { startMs: number; title: string }[];
}): ChaptersJson => ({
  summary: llmOutput.summary,
  chapters: llmOutput.chapters,
});

/**
 * Mark the row as FAILED and publish SSE STATUS_UPDATE + ERROR. Used
 * by every permanent-failure path so the dashboard surfaces the
 * `failureReason` text and the user sees the transition immediately.
 */
const markFailed = async (
  ctx: ProcessContext,
  videoId: string,
  userId: string,
  reason: string,
): Promise<void> => {
  await prisma.video.update({
    where: { id: videoId },
    data: { status: "FAILED", failureReason: reason },
  });
  if (ctx.events) {
    void ctx.events.publish({
      type: "STATUS_UPDATE",
      videoId,
      userId,
      status: "FAILED",
      timestamp: nowIso(),
    });
    void ctx.events.publish({
      type: "ERROR",
      videoId,
      userId,
      error: reason,
      timestamp: nowIso(),
    });
  }
};

/**
 * Process one `generate` BullMQ job.
 */
export const processGenerateJob = async (
  job: Job<GenerateJobData>,
  ctx: ProcessContext,
): Promise<void> => {
  const { videoId } = job.data;
  ctx.logger.info(
    { jobId: job.id, videoId, attempt: job.attemptsMade + 1 },
    "Starting generate job",
  );

  // ---- Resolve the row ----
  const video = await prisma.video
    .findUnique({
      where: { id: videoId },
      select: {
        userId: true,
        transcriptS3Key: true,
        chaptersJson: true,
        status: true,
      },
    })
    .catch(() => null);

  if (!video) {
    ctx.logger.warn({ videoId }, "Video row missing — skipping generate");
    return;
  }

  // ---- Idempotency: already-generated rows skip ----
  if (video.chaptersJson) {
    ctx.logger.info(
      { videoId, hasChapters: true },
      "Video already has chaptersJson — skipping (idempotent)",
    );
    return;
  }

  const userId = video.userId;
  const canPublish = !!userId && !!ctx.events;

  // ---- Permanent: transcript missing in S3 ----
  if (!video.transcriptS3Key) {
    const reason =
      "[GEN_TRANSCRIPT_MISSING] Transcript S3 key is null — transcription must complete before generation can start.";
    await markFailed(ctx, videoId, userId, reason);
    ctx.logger.warn(
      { videoId, status: video.status },
      "Transcript missing — marking FAILED",
    );
    return;
  }

  // ---- Status flip: ensure GENERATING (idempotent — transcription set this) ----
  if (video.status !== "GENERATING") {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "GENERATING", failureReason: null },
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
  }

  // ---- Temp dir, cleaned up in `finally` ----
  const tempDir = await mkdtemp(TMP_PREFIX);
  const transcriptPath = join(tempDir, "transcript.json");

  try {
    const s3Config = buildS3Config(ctx.env);
    const s3Client = getS3Client(s3Config);

    // ---- 1. Stream transcript from S3 to temp file ----
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId: userId!,
        progress: 10,
        stage: "Loading transcript",
        timestamp: nowIso(),
      });
    }

    ctx.logger.info(
      { videoId, s3Key: video.transcriptS3Key, tempDir },
      "Downloading transcript from S3",
    );
    const { body } = await getObjectStream(
      s3Client,
      s3Config,
      video.transcriptS3Key,
    );
    const webStream = (
      body as unknown as { transformToWebStream(): NodeJS.ReadableStream }
    ).transformToWebStream();
    await pipeline(
      Readable.fromWeb(
        webStream as unknown as Parameters<typeof Readable.fromWeb>[0],
      ),
      createWriteStream(transcriptPath),
    );

    const rawTranscript = await readFile(transcriptPath, "utf8");

    // ---- 2. Parse the AaiTranscript ----
    let transcript: AaiTranscript;
    try {
      transcript = JSON.parse(rawTranscript) as AaiTranscript;
    } catch (err) {
      const reason =
        "[GEN_TRANSCRIPT_PARSE_ERROR] Transcript JSON in S3 is malformed; cannot proceed with generation.";
      await markFailed(ctx, videoId, userId, reason);
      ctx.logger.error(
        { videoId, err: err instanceof Error ? err.message : String(err) },
        "Transcript parse failed — marking FAILED",
      );
      return;
    }

    if (!transcript.text || !Array.isArray(transcript.words)) {
      const reason =
        "[GEN_TRANSCRIPT_PARSE_ERROR] Transcript JSON is missing required fields (text, words).";
      await markFailed(ctx, videoId, userId, reason);
      ctx.logger.error({ videoId }, "Transcript missing required fields");
      return;
    }

    ctx.logger.info(
      {
        videoId,
        languageCode: transcript.languageCode,
        durationMs: transcript.durationMs,
        wordCount: transcript.words.length,
        chapterCount: transcript.chapters.length,
      },
      "Transcript loaded",
    );

    // ---- 3. Build prompt + call LLM ----
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId: userId!,
        progress: 35,
        stage: "Generating chapters",
        timestamp: nowIso(),
      });
    }

    const promptInput = {
      transcriptText: truncateTranscript(transcript.text, MAX_TRANSCRIPT_CHARS),
      durationMs: transcript.durationMs,
      aaiChapters: transcript.chapters,
      languageCode: transcript.languageCode,
    };
    const { systemPrompt, userPrompt } = buildSelectHighlightsPrompt(promptInput);

    // The LLM client is built per-job (cheap) so a future change to
    // buildLlmClient can swap providers without touching the queue.
    const llmClient = new OpenAICompatLlmClient(ctx.env);

    let validated: Awaited<ReturnType<typeof validateWithRetry>>;
    try {
      validated = await validateWithRetry({
        client: llmClient,
        request: {
          systemPrompt,
          userPrompt,
          jsonMode: true,
        },
        maxAttempts: 3,
      });
    } catch (err) {
      const classified = classifyLlmError(err);
      if (classified.kind === "permanent") {
        const reason = `[${classified.reasonCode}] ${classified.message}`;
        await markFailed(ctx, videoId, userId, reason);
        ctx.logger.warn(
          {
            videoId,
            reasonCode: classified.reasonCode,
            message: classified.message,
          },
          "Generate failed permanently; not retrying",
        );
        return;
      }

      // Transient: rethrow so BullMQ applies backoff.
      ctx.logger.warn(
        {
          videoId,
          reasonCode: classified.reasonCode,
          message: classified.message,
        },
        "Generate failed transiently; BullMQ will retry",
      );
      throw new Error(`[${classified.reasonCode}] ${classified.message}`);
    }

    ctx.logger.info(
      {
        videoId,
        attempts: validated.attempts,
        chapterCount: validated.output.chapters.length,
        summaryLen: validated.output.summary.length,
      },
      "LLM returned valid output",
    );

    // ---- 4. Update row → READY_FOR_REVIEW ----
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId: userId!,
        progress: 90,
        stage: "Finalizing",
        timestamp: nowIso(),
      });
    }

    await prisma.video.update({
      where: { id: videoId },
      data: {
        // Prisma's `InputJsonValue` requires an explicit
        // [key: string]: unknown index signature. The concrete shape is
        // declared above; the cast here is the only place Prisma sees
        // it, so we keep it narrow.
        chaptersJson: toChaptersJson(validated.output) as unknown as object,
        status: "READY_FOR_REVIEW",
        // Clear any prior failureReason now that we've reached
        // READY_FOR_REVIEW — the user shouldn't see a stale error
        // message alongside a successful generation.
        failureReason: null,
      },
    });

    if (canPublish) {
      void ctx.events!.publish({
        type: "STATUS_UPDATE",
        videoId,
        userId: userId!,
        status: "READY_FOR_REVIEW",
        timestamp: nowIso(),
      });
    }

    ctx.logger.info(
      {
        videoId,
        chapterCount: validated.output.chapters.length,
        summaryLen: validated.output.summary.length,
      },
      "Generate job completed",
    );
  } catch (err) {
    ctx.logger.error(
      {
        videoId,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Generate failed unexpectedly; will retry",
    );
    throw err;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Best-effort cleanup — a leftover temp dir is harmless
    });
  }
};
