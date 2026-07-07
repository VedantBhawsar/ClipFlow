/**
 * BullMQ queue + worker construction.
 *
 * Three queues are built here:
 *  - `youtube-publish` — consumes the publish path (YouTube upload).
 *    Concurrency intentionally low (1) because each job can be a
 *    multi-minute YouTube upload.
 *  - `video-ingest` — consumes the extract path (FFmpeg audio + frames).
 *    Concurrency is also 1 because FFmpeg is CPU/IO heavy and multiple
 *    concurrent in-flight jobs would contend on temp disk and CPU.
 *  - `transcription` — consumes the AssemblyAI transcription path. Runs
 *    after `video-ingest` finishes (the ingest job enqueues the
 *    transcription job at its tail — see `video-ingest.ts`). Concurrency
 *    is 1 to bound concurrent outbound API calls + temp disk usage.
 *
 * All three queues share the same Redis connection.
 */
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "@clipflow/config";
import type { Logger } from "./logger.js";
import { processYoutubePublishJob, type PublishJobData } from "../jobs/youtube-publish.js";
import {
  processVideoIngestJob,
  type VideoIngestJobData,
} from "../jobs/video-ingest.js";
import {
  processTranscriptionJob,
  type TranscriptionJobData,
} from "../jobs/transcription.js";
import {
  processGenerateJob,
  type GenerateJobData,
} from "../jobs/generate.js";
import {
  processThumbnailsJob,
  type ThumbnailsJobData,
} from "../jobs/thumbnails.js";
import {
  processChannelStyleAnalyzeJob,
  type ChannelStyleJobData,
} from "../jobs/channel-style-analyze.js";
import { prisma } from "@clipflow/db";
import type { EventPublisher } from "../lib/events.js";

export const YOUTUBE_PUBLISH_QUEUE = "youtube-publish";
export const VIDEO_INGEST_QUEUE = "video-ingest";
export const TRANSCRIPTION_QUEUE = "transcription";
export const GENERATE_QUEUE = "generate";
export const THUMBNAILS_QUEUE = "thumbnails";
export const CHANNEL_STYLE_QUEUE = "channel-style-analyze";

export interface BuiltPublishQueue {
  queue: Queue<PublishJobData>;
  worker: Worker<PublishJobData>;
  connection: Redis;
}

export interface BuiltIngestQueue {
  queue: Queue<VideoIngestJobData>;
  worker: Worker<VideoIngestJobData>;
}

export interface BuiltTranscriptionQueue {
  queue: Queue<TranscriptionJobData>;
  worker: Worker<TranscriptionJobData>;
}

export interface BuiltGenerateQueue {
  queue: Queue<GenerateJobData>;
  worker: Worker<GenerateJobData>;
}

export interface BuiltThumbnailsQueue {
  queue: Queue<ThumbnailsJobData>;
  worker: Worker<ThumbnailsJobData>;
}

export interface BuiltChannelStyleQueue {
  queue: Queue<ChannelStyleJobData>;
  worker: Worker<ChannelStyleJobData>;
}

/**
 * Build the publish queue + worker pair and wire the failed-job listener so
 * retried-and-exhausted jobs mark the Video as PUBLISH_FAILED.
 */
export const buildPublishQueue = (
  connection: Redis,
  env: Env,
  logger: Logger,
  events?: EventPublisher,
): BuiltPublishQueue => {
  const queue = new Queue<PublishJobData>(YOUTUBE_PUBLISH_QUEUE, {
    connection,
    prefix: env.BULLMQ_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  });

  const worker = new Worker<PublishJobData>(
    YOUTUBE_PUBLISH_QUEUE,
    async (job) =>
      processYoutubePublishJob(job, { env, logger, events }),
    {
      connection,
      prefix: env.BULLMQ_PREFIX,
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        videoId: job?.data.videoId,
        attemptsMade: job?.attemptsMade,
        err: { message: err.message, name: err.name },
      },
      "Publish job failed",
    );
  });

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, videoId: job.data.videoId },
      "Publish job completed",
    );
  });

  return { queue, worker, connection };
};

/**
 * Build the video-ingest queue + worker pair.
 *
 * Concurrency = 1 (CPU/IO heavy). Attempts = 3 with exponential backoff
 * starting at 5 s. The `failed` listener marks rows as FAILED when
 * BullMQ exhausts retries.
 *
 * The `enqueueTranscription` callback is passed through to
 * `processVideoIngestJob` so the ingest worker can fan out to the
 * transcription queue on success. Optional so tests that exercise
 * only the extract path can pass a no-op.
 */
export const buildVideoIngestQueue = (
  connection: Redis,
  env: Env,
  logger: Logger,
  events?: EventPublisher,
  enqueueTranscription?: (videoId: string) => Promise<void>,
): BuiltIngestQueue => {
  const queue = new Queue<VideoIngestJobData>(VIDEO_INGEST_QUEUE, {
    connection,
    prefix: env.BULLMQ_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  });

  const worker = new Worker<VideoIngestJobData>(
    VIDEO_INGEST_QUEUE,
    async (job) =>
      processVideoIngestJob(job, {
        env,
        logger,
        events,
        enqueueTranscription,
      }),
    {
      connection,
      prefix: env.BULLMQ_PREFIX,
      concurrency: 1,
    },
  );

  worker.on("failed", async (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        videoId: job?.data.videoId,
        attemptsMade: job?.attemptsMade,
        err: { message: err.message, name: err.name },
      },
      "Video-ingest job failed",
    );

    // BullMQ exhausted all retries — mark the row as FAILED if the row exists.
    // This mirrors the pattern in youtube-publish.ts.
    if (job?.attemptsMade !== undefined && job.attemptsMade >= 2) {
      try {
        await prisma.video.update({
          where: { id: job.data.videoId },
          data: {
            status: "FAILED",
            failureReason: `Video-ingest job exhausted after ${job.attemptsMade + 1} attempts: ${err.message}`,
          },
        });
      } catch {
        // Row may already be gone — ignore
      }
    }
  });

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, videoId: job.data.videoId },
      "Video-ingest job completed",
    );
  });

  return { queue, worker };
};

/**
 * Build the transcription queue + worker pair.
 *
 * Concurrency = 1 (AssemblyAI upload + temp disk pressure). Attempts =
 * 3 with exponential backoff starting at 30 s — AssemblyAI processing
 * can take 30 s – 3 min depending on audio length, so the first
 * retry shouldn't fire too aggressively.
 *
 * The `failed` listener marks rows as FAILED when BullMQ exhausts
 * retries, mirroring the pattern in `buildVideoIngestQueue`.
 *
 * The `enqueueGenerate` callback is passed through to
 * `processTranscriptionJob` so the transcription worker can fan out
 * to the generate queue on success. Optional so unit tests that
 * exercise only the transcription path can pass a no-op.
 */
export const buildTranscriptionQueue = (
  connection: Redis,
  env: Env,
  logger: Logger,
  events?: EventPublisher,
  enqueueGenerate?: (videoId: string) => Promise<void>,
): BuiltTranscriptionQueue => {
  const queue = new Queue<TranscriptionJobData>(TRANSCRIPTION_QUEUE, {
    connection,
    prefix: env.BULLMQ_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  });

  const worker = new Worker<TranscriptionJobData>(
    TRANSCRIPTION_QUEUE,
    async (job) =>
      processTranscriptionJob(job, { env, logger, events, enqueueGenerate }),
    {
      connection,
      prefix: env.BULLMQ_PREFIX,
      concurrency: 1,
    },
  );

  worker.on("failed", async (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        videoId: job?.data.videoId,
        attemptsMade: job?.attemptsMade,
        err: { message: err.message, name: err.name },
      },
      "Transcription job failed",
    );

    if (job?.attemptsMade !== undefined && job.attemptsMade >= 2) {
      try {
        await prisma.video.update({
          where: { id: job.data.videoId },
          data: {
            status: "FAILED",
            failureReason: `Transcription job exhausted after ${job.attemptsMade + 1} attempts: ${err.message}`,
          },
        });
      } catch {
        // Row may already be gone — ignore
      }
    }
  });

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, videoId: job.data.videoId },
      "Transcription job completed",
    );
  });

  return { queue, worker };
};

/**
 * Build the generate queue + worker pair.
 *
 * Concurrency = 1 (one LLM call + temp file per video — no value in
 * running multiple at once, and the LLM has per-key rate limits).
 * Attempts = 3 with exponential backoff starting at 60 s — Llama 3.1
 * 70B at 50 KB transcripts takes ~10-30 s, so a 60 s base delay keeps
 * the first retry from clobbering a transient upstream issue.
 *
 * The `failed` listener marks rows as FAILED when BullMQ exhausts
 * retries, mirroring the pattern in `buildTranscriptionQueue`.
 */
export const buildGenerateQueue = (
  connection: Redis,
  env: Env,
  logger: Logger,
  events?: EventPublisher,
  enqueueThumbnails?: (videoId: string) => Promise<void>,
): BuiltGenerateQueue => {
  const queue = new Queue<GenerateJobData>(GENERATE_QUEUE, {
    connection,
    prefix: env.BULLMQ_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  });

  const worker = new Worker<GenerateJobData>(
    GENERATE_QUEUE,
    async (job) => processGenerateJob(job, { env, logger, events, enqueueThumbnails }),
    {
      connection,
      prefix: env.BULLMQ_PREFIX,
      concurrency: 1,
    },
  );

  worker.on("failed", async (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        videoId: job?.data.videoId,
        attemptsMade: job?.attemptsMade,
        err: { message: err.message, name: err.name },
      },
      "Generate job failed",
    );

    if (job?.attemptsMade !== undefined && job.attemptsMade >= 2) {
      try {
        await prisma.video.update({
          where: { id: job.data.videoId },
          data: {
            status: "FAILED",
            failureReason: `Generate job exhausted after ${job.attemptsMade + 1} attempts: ${err.message}`,
          },
        });
      } catch {
        // Row may already be gone — ignore
      }
    }
  });

  worker.on("completed", (job) => {
    logger.info(
      { jobId: job.id, videoId: job.data.videoId },
      "Generate job completed",
    );
  });

  return { queue, worker };
};

export type PublishJob = Job<PublishJobData>;
export type IngestJob = Job<VideoIngestJobData>;
export type TranscriptionJob = Job<TranscriptionJobData>;
export type GenerateJob = Job<GenerateJobData>;
export type ThumbnailsJob = Job<ThumbnailsJobData>;
export type ChannelStyleJob = Job<ChannelStyleJobData>;

// ---------- Thumbnails queue ----------

/**
 * Build the thumbnails queue + worker pair.
 *
 * Concurrency = 1 (image generation API calls + S3 uploads). Attempts
 * = 3 with exponential backoff starting at 30 s.
 *
 * The `failed` listener ensures the ThumbnailGeneration row is marked
 * as FAILED when BullMQ exhausts retries.
 */
export const buildThumbnailsQueue = (
  connection: Redis,
  env: Env,
  logger: Logger,
  events?: EventPublisher,
): BuiltThumbnailsQueue => {
  const queue = new Queue<ThumbnailsJobData>(THUMBNAILS_QUEUE, {
    connection,
    prefix: env.BULLMQ_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  });

  const worker = new Worker<ThumbnailsJobData>(
    THUMBNAILS_QUEUE,
    async (job) => processThumbnailsJob(job, { env, logger, events }),
    { connection, prefix: env.BULLMQ_PREFIX, concurrency: 1 },
  );

  worker.on("failed", async (job, err) => {
    logger.error(
      { jobId: job?.id, videoId: job?.data.videoId, attemptsMade: job?.attemptsMade, err: err.message },
      "Thumbnails job failed",
    );

    if (job?.attemptsMade !== undefined && job.attemptsMade >= 2) {
      try {
        await prisma.video.update({
          where: { id: job.data.videoId },
          data: {
            status: "FAILED",
            failureReason: `Thumbnails job exhausted after ${job.attemptsMade + 1} attempts: ${err.message}`,
          },
        });
      } catch {
        // Row may already be gone — ignore
      }
    }
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, videoId: job.data.videoId }, "Thumbnails job completed");
  });

  return { queue, worker };
};

// ---------- Channel Style Analysis queue ----------

/**
 * Build the channel-style-analyze queue + worker pair.
 *
 * Concurrency = 1 (Gemini Vision API calls + YouTube API calls).
 * Attempts = 3 with exponential backoff starting at 30 s.
 * Runs once per channel, not once per video.
 */
export const buildChannelStyleQueue = (
  connection: Redis,
  env: Env,
  logger: Logger,
  events?: EventPublisher,
): BuiltChannelStyleQueue => {
  const queue = new Queue<ChannelStyleJobData>(CHANNEL_STYLE_QUEUE, {
    connection,
    prefix: env.BULLMQ_PREFIX,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86_400, count: 1000 },
      removeOnFail: { age: 604_800 },
    },
  });

  const worker = new Worker<ChannelStyleJobData>(
    CHANNEL_STYLE_QUEUE,
    async (job) => processChannelStyleAnalyzeJob(job, { env, logger, events }),
    { connection, prefix: env.BULLMQ_PREFIX, concurrency: 1 },
  );

  worker.on("failed", async (job, err) => {
    logger.error(
      { jobId: job?.id, userId: job?.data.userId, attemptsMade: job?.attemptsMade, err: err.message },
      "Channel style analysis job failed",
    );
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, userId: job.data.userId }, "Channel style analysis completed");
  });

  return { queue, worker };
};
