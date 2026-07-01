/**
 * Worker job: extract audio + candidate frames from an uploaded video.
 *
 * Flow:
 *   1. Resolve the Video row from the queue payload.
 *   2. Idempotency guard: skip if `s3KeyAudio` is already set.
 *   3. Set status = EXTRACTING; publish SSE STATUS_UPDATE.
 *   4. Stream the original from S3 into a temp file.
 *   5. Run FFmpeg (single invocation, two outputs).
 *   6. Upload the audio + frames back to S3.
 *   7. Update the Video row with s3KeyAudio / s3KeyFramesPrefix /
 *      frameCount / durationSeconds / status = TRANSCRIBING.
 *   8. Enqueue the `transcription` job (step 9 of the slice plan).
 *   9. Publish SSE STATUS_UPDATE.
 *
 * Failure handling:
 *   - Permanent FFmpeg failures (corrupt input, binary missing) →
 *     set status = FAILED with a `[code] message` failureReason, publish
 *     SSE STATUS_UPDATE + ERROR, do NOT retry.
 *   - Transient failures (S3 5xx, out-of-disk) → rethrow so BullMQ's
 *     exponential backoff retries (3 attempts, 60s base delay).
 *
 * Why the ingest worker enqueues its own follow-up rather than the
 * API doing it: with concurrency=1 on the ingest queue, a video's
 * transcription job can only start AFTER its ingest job completes.
 * The API enqueuing both at finalize time would either (a) require
 * the transcription job to poll-wait for `s3KeyAudio` to be set
 * (ugly), or (b) risk the transcription job firing before audio
 * exists and failing permanent. The worker-side enqueue avoids both:
 * the audio key is always set when we enqueue, and the deterministic
 * jobId (`transcribe-${videoId}`) dedupes against any stale recovery
 * re-enqueue.
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
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extractAudioAndFrames } from "../lib/ffmpeg.js";
import { classifyFfmpegError } from "../lib/ffmpeg-errors.js";
import type { Logger } from "../config/logger.js";
import type { EventPublisher } from "../lib/events.js";

export interface VideoIngestJobData {
  videoId: string;
}

export interface ProcessContext {
  env: Env;
  logger: Logger;
  events?: EventPublisher;
  /**
   * Enqueue a follow-up `transcription` job for the given video.
   * Set by the worker at boot after the transcription queue is
   * constructed. Optional so unit tests that exercise only the
   * extract path can pass a no-op / vi.fn() mock.
   */
  enqueueTranscription?: (videoId: string) => Promise<void>;
}

const TMP_PREFIX = join(tmpdir(), "clipflow-extract-");
const AUDIO_CONTENT_TYPE = "audio/mpeg";
const FRAME_CONTENT_TYPE = "image/jpeg";

const nowIso = (): string => new Date().toISOString();

/**
 * Process one `video-ingest` BullMQ job.
 */
export const processVideoIngestJob = async (
  job: Job<VideoIngestJobData>,
  ctx: ProcessContext,
): Promise<void> => {
  const { videoId } = job.data;
  ctx.logger.info(
    { jobId: job.id, videoId, attempt: job.attemptsMade + 1 },
    "Starting video-ingest job",
  );

  // ---- Resolve the row ----
  const video = await prisma.video
    .findUnique({
      where: { id: videoId },
      select: {
        userId: true,
        s3KeyOriginal: true,
        s3KeyAudio: true,
        status: true,
      },
    })
    .catch(() => null);

  if (!video) {
    ctx.logger.warn({ videoId }, "Video row missing — skipping ingest");
    return;
  }

  // ---- Idempotency: already-extracted rows skip ----
  if (video.s3KeyAudio) {
    ctx.logger.info(
      { videoId, s3KeyAudio: video.s3KeyAudio },
      "Video already has extracted audio — skipping (idempotent)",
    );
    return;
  }

  const userId = video.userId;
  const canPublish = !!userId && !!ctx.events;

  // ---- Status flip: any non-EXTRACTING state → EXTRACTING ----
  if (video.status !== "EXTRACTING") {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "EXTRACTING", failureReason: null },
    });
  }

  if (canPublish) {
    void ctx.events!.publish({
      type: "STATUS_UPDATE",
      videoId,
      userId,
      status: "EXTRACTING",
      timestamp: nowIso(),
    });
  }

  // ---- Temp dir, cleaned up in `finally` ----
  const tempDir = await mkdtemp(TMP_PREFIX);
  const inputPath = join(tempDir, "input.mp4");

  try {
    const s3Config = buildS3Config(ctx.env);
    const s3Client = getS3Client(s3Config);

    // ---- 1. Stream original from S3 to temp file ----
    ctx.logger.info(
      { videoId, s3Key: video.s3KeyOriginal, tempDir },
      "Downloading original from S3",
    );
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId,
        progress: 10,
        stage: "Downloading original",
        timestamp: nowIso(),
      });
    }

    const { body, contentLength } = await getObjectStream(
      s3Client,
      s3Config,
      video.s3KeyOriginal,
    );

    // Convert AWS SDK SdkStream (Web stream) → Node Readable for pipeline.
    // The DOM ReadableStream and Node stream/web ReadableStream differ at
    // the type level; the `as unknown as` bridge silences that mismatch.
    const webStream = (
      body as unknown as { transformToWebStream(): NodeJS.ReadableStream }
    ).transformToWebStream();
    await pipeline(
      Readable.fromWeb(
        webStream as unknown as Parameters<typeof Readable.fromWeb>[0],
      ),
      createWriteStream(inputPath),
    );
    ctx.logger.info({ videoId, contentLength }, "Downloaded original to temp");

    // ---- 2. Run FFmpeg (single invocation, two outputs) ----
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId,
        progress: 35,
        stage: "Extracting audio & frames",
        timestamp: nowIso(),
      });
    }

    let extractResult: Awaited<ReturnType<typeof extractAudioAndFrames>>;
    try {
      extractResult = await extractAudioAndFrames(
        inputPath,
        tempDir,
        { ffmpegPath: ctx.env.FFMPEG_PATH },
      );
    } catch (err) {
      const classified = classifyFfmpegError(err);
      if (classified.kind === "permanent") {
        await prisma.video.update({
          where: { id: videoId },
          data: {
            status: "FAILED",
            failureReason: `[${classified.reasonCode}] ${classified.message}`,
          },
        });

        if (canPublish) {
          void ctx.events!.publish({
            type: "STATUS_UPDATE",
            videoId,
            userId,
            status: "FAILED",
            timestamp: nowIso(),
          });
          void ctx.events!.publish({
            type: "ERROR",
            videoId,
            userId,
            error: `[${classified.reasonCode}] ${classified.message}`,
            timestamp: nowIso(),
          });
        }

        ctx.logger.warn(
          { videoId, reasonCode: classified.reasonCode, message: classified.message },
          "Ingest failed permanently; not retrying",
        );
        return;
      }

      // Transient: rethrow for BullMQ backoff
      ctx.logger.warn(
        { videoId, reasonCode: classified.reasonCode, message: classified.message },
        "Ingest failed transiently; BullMQ will retry",
      );
      throw new Error(`[${classified.reasonCode}] ${classified.message}`);
    }

    ctx.logger.info(
      { videoId, durationSeconds: extractResult.durationSeconds, frameCount: extractResult.framePaths.length },
      "FFmpeg extraction complete",
    );

    // ---- 3. Upload audio to S3 ----
    const audioS3Key = `videos/${videoId}/audio.mp3`;
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId,
        progress: 70,
        stage: "Uploading audio",
        timestamp: nowIso(),
      });
    }
    await putObjectFromFile(
      s3Client,
      s3Config,
      audioS3Key,
      extractResult.audioPath,
      AUDIO_CONTENT_TYPE,
    );
    ctx.logger.info({ videoId, key: audioS3Key }, "Uploaded audio to S3");

    // ---- 4. Upload frames to S3 ----
    const framesPrefix = `videos/${videoId}/frames/`;
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId,
        progress: 85,
        stage: "Uploading frames",
        timestamp: nowIso(),
      });
    }
    let uploadedFrames = 0;
    for (const framePath of extractResult.framePaths) {
      const frameName = framePath.split("/").pop() ?? `frame_${uploadedFrames + 1}.jpg`;
      await putObjectFromFile(
        s3Client,
        s3Config,
        framesPrefix + frameName,
        framePath,
        FRAME_CONTENT_TYPE,
      );
      uploadedFrames++;
    }
    ctx.logger.info({ videoId, framesPrefix, frameCount: uploadedFrames }, "Uploaded frames to S3");

    // ---- 5. Update row → TRANSCRIBING (transcription enqueue lands in next slice) ----
    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId,
        progress: 95,
        stage: "Finalizing",
        timestamp: nowIso(),
      });
    }

    await prisma.video.update({
      where: { id: videoId },
      data: {
        s3KeyAudio: audioS3Key,
        s3KeyFramesPrefix: framesPrefix,
        frameCount: uploadedFrames,
        durationSeconds: extractResult.durationSeconds,
        status: "TRANSCRIBING",
      },
    });

    if (canPublish) {
      void ctx.events!.publish({
        type: "STATUS_UPDATE",
        videoId,
        userId,
        status: "TRANSCRIBING",
        timestamp: nowIso(),
      });
    }

    // ---- 6. Enqueue the transcription follow-up ----
    //
    // Done AFTER the DB update so a crash between enqueue and DB
    // update doesn't leave a stranded job (the job would have nothing
    // to transcribe). The deterministic jobId (`transcribe-${id}`)
    // dedupes against any stale recovery re-enqueue.
    if (ctx.enqueueTranscription) {
      try {
        await ctx.enqueueTranscription(videoId);
        ctx.logger.info(
          { videoId },
          "Enqueued transcription follow-up job",
        );
      } catch (enqueueErr) {
        // If the enqueue itself fails (Redis blip), rethrow so
        // BullMQ retries the whole ingest job. The next attempt
        // will short-circuit on the s3KeyAudio idempotency check
        // and re-enqueue the transcription.
        ctx.logger.error(
          {
            videoId,
            err: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
          },
          "Failed to enqueue transcription follow-up; rethrowing for retry",
        );
        throw enqueueErr;
      }
    } else {
      ctx.logger.info(
        { videoId },
        "transcription enqueue not wired — leaving row at TRANSCRIBING for next slice",
      );
    }

    ctx.logger.info(
      { videoId, audioS3Key, framesPrefix, frameCount: uploadedFrames, durationSeconds: extractResult.durationSeconds },
      "Video-ingest job completed",
    );
  } catch (err) {
    // Anything not classified as permanent above is transient by default.
    // Log and rethrow so BullMQ applies backoff. The `failed` listener
    // in queue.ts handles exhaustion → FAILED.
    if (
      err instanceof Error &&
      err.message.startsWith("[FFMPEG_RUNTIME_ERROR]")
    ) {
      throw err;
    }

    ctx.logger.error(
      {
        videoId,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Ingest failed unexpectedly; will retry",
    );
    throw err;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Best-effort cleanup — a leftover temp dir is harmless
    });
  }
};
