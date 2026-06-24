/**
 * BullMQ enqueue helpers.
 *
 * The API only enqueues — it never consumes. The worker (apps/worker)
 * is the sole consumer of the `youtube-publish` queue.
 *
 * If REDIS_URL is missing (dev fallback), `getPublishQueue()` returns
 * null and `enqueuePublishJob` throws QUEUE_UNAVAILABLE so the API
 * caller can decide whether to surface that to the user or fall back
 * to the immediate-publish path.
 */
import { Queue } from "bullmq";
import { Redis, type Redis as RedisType } from "ioredis";
import type { Env } from "@clipflow/config";
import { AppError } from "../errors/AppError.js";

export const YOUTUBE_PUBLISH_QUEUE = "youtube-publish";

let cachedConnection: RedisType | null = null;
let cachedQueue: Queue | null = null;

/**
 * Get (or build) the singleton publish queue. Returns null when Redis
 * is not configured — callers can decide whether that's an error.
 *
 * @param env Validated env.
 * @returns Queue or null.
 */
export const getPublishQueue = (env: Env): Queue | null => {
  if (!env.REDIS_URL) return null;
  if (cachedQueue) return cachedQueue;
  cachedConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
  });
  cachedQueue = new Queue(YOUTUBE_PUBLISH_QUEUE, {
    connection: cachedConnection,
    prefix: env.BULLMQ_PREFIX,
  });
  return cachedQueue;
};

/**
 * Enqueue a `youtube-publish` job for a Video. Uses a deterministic
 * `jobId` so re-enqueuing the same video (e.g. on a finalize retry)
 * dedupes instead of duplicating.
 *
 * @param videoId The Video row id.
 * @param scheduledPublishAt If set, the job is delayed until this time
 *   (used for SCHEDULED videos). If null, the job runs immediately
 *   (immediate publish path).
 * @param env Validated env.
 * @throws AppError(503, QUEUE_UNAVAILABLE) when REDIS_URL is unset.
 */
export const enqueuePublishJob = async (
  videoId: string,
  scheduledPublishAt: Date | null,
  env: Env,
): Promise<void> => {
  const queue = getPublishQueue(env);
  if (!queue) {
    throw new AppError(
      503,
      "QUEUE_UNAVAILABLE",
      "REDIS_URL is not configured; cannot enqueue publish jobs.",
    );
  }
  const delay = scheduledPublishAt
    ? Math.max(0, scheduledPublishAt.getTime() - Date.now())
    : undefined;

  await queue.add(
    "youtube-publish",
    { videoId },
    {
      jobId: `publish-${videoId}`,
      ...(delay !== undefined ? { delay } : {}),
    },
  );
};

/**
 * Close the BullMQ connection on graceful shutdown.
 */
export const closePublishQueue = async (): Promise<void> => {
  if (cachedQueue) {
    await cachedQueue.close();
    cachedQueue = null;
  }
  if (cachedConnection) {
    cachedConnection.disconnect();
    cachedConnection = null;
  }
};