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
 *
 * `verifyPublishQueue()` is the boot-time PING. It builds the connection
 * (if needed) and confirms Redis is reachable, so a bad REDIS_URL shows up
 * in the startup banner instead of as a 503 on the first publish request.
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
    lazyConnect: true,
  });
  cachedConnection.on("error", (err) => {
    // Surfaced here for visibility; verifyPublishQueue() is the
    // authoritative reachability check.
    console.error("[queue] redis error:", err.message);
  });
  cachedQueue = new Queue(YOUTUBE_PUBLISH_QUEUE, {
    connection: cachedConnection,
    prefix: env.BULLMQ_PREFIX,
  });
  return cachedQueue;
};

/**
 * Boot-time reachability check for the BullMQ backing Redis. Connects the
 * shared `cachedConnection` (if it isn't already) and PINGs. Safe to call
 * before any `enqueuePublishJob` calls.
 *
 * @param env Validated env.
 * @returns `{ ok: true, latencyMs }` when reachable, otherwise
 *   `{ ok: false, error }`. Returns `{ ok: false, error: "not-configured" }`
 *   when REDIS_URL is unset (queue is optional in dev).
 */
export const verifyPublishQueue = async (
  env: Env,
): Promise<
  | { ok: true; latencyMs: number }
  | { ok: false; error: string }
> => {
  if (!env.REDIS_URL) {
    return { ok: false, error: "not-configured" };
  }
  const start = Date.now();
  try {
    // getPublishQueue() is idempotent — calling it here both constructs and
    // returns the connection we need to ping.
    getPublishQueue(env);
    if (!cachedConnection) {
      return { ok: false, error: "connection-not-initialized" };
    }
    if (cachedConnection.status === "wait" || cachedConnection.status === "end") {
      await cachedConnection.connect();
    }
    const pong = await cachedConnection.ping();
    if (pong !== "PONG") {
      return { ok: false, error: `PING returned unexpected response: ${pong}` };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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
