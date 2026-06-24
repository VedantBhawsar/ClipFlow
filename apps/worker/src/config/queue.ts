/**
 * BullMQ queue + worker construction.
 *
 * The worker is the sole consumer of `youtube-publish`. Concurrency
 * is intentionally low (1) because each job can be a multi-minute
 * YouTube upload — running many in parallel would just hammer the
 * YouTube Data API quota.
 */
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "@clipflow/config";
import type { Logger } from "./logger.js";
import { processYoutubePublishJob, type PublishJobData } from "../jobs/youtube-publish.js";

export const YOUTUBE_PUBLISH_QUEUE = "youtube-publish";

export interface BuiltQueue {
  queue: Queue<PublishJobData>;
  worker: Worker<PublishJobData>;
  connection: Redis;
}

/**
 * Build the queue + worker pair and wire the failed-job listener so
 * retried-and-exhausted jobs mark the Video as PUBLISH_FAILED.
 */
export const buildPublishQueue = (env: Env, logger: Logger): BuiltQueue => {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required to build the publish queue.");
  }
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

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
    async (job) => processYoutubePublishJob(job, { env, logger }),
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

export type PublishJob = Job<PublishJobData>;