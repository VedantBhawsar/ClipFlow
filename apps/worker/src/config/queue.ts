/**
 * BullMQ queue + worker construction.
 *
 * Two queues are built here:
 *  - `youtube-publish` — consumes the publish path (YouTube upload).
 *    Concurrency intentionally low (1) because each job can be a
 *    multi-minute YouTube upload.
 *  - `video-ingest` — consumes the extract path (FFmpeg audio + frames).
 *    Concurrency is also 1 because FFmpeg is CPU/IO heavy and multiple
 *    concurrent in-flight jobs would contend on temp disk and CPU.
 *
 * Both queues share the same Redis connection.
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
import { prisma } from "@clipflow/db";
import type { EventPublisher } from "../lib/events.js";

export const YOUTUBE_PUBLISH_QUEUE = "youtube-publish";
export const VIDEO_INGEST_QUEUE = "video-ingest";

export interface BuiltPublishQueue {
  queue: Queue<PublishJobData>;
  worker: Worker<PublishJobData>;
  connection: Redis;
}

export interface BuiltIngestQueue {
  queue: Queue<VideoIngestJobData>;
  worker: Worker<VideoIngestJobData>;
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
 */
export const buildVideoIngestQueue = (
  connection: Redis,
  env: Env,
  logger: Logger,
  events?: EventPublisher,
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
      processVideoIngestJob(job, { env, logger, events }),
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

export type PublishJob = Job<PublishJobData>;
export type IngestJob = Job<VideoIngestJobData>;
