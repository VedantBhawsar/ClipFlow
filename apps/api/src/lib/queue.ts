/**
 * BullMQ enqueue helpers.
 *
 * The API only enqueues — it never consumes. The worker (apps/worker)
 * is the sole consumer of both the `youtube-publish` and `video-ingest`
 * queues.
 *
 * Both queues share the same Redis connection (`cachedConnection`) so
 * we don't double up on sockets. If REDIS_URL is missing (dev
 * fallback), `getPublishQueue()` / `getIngestQueue()` return null and
 * the corresponding `enqueueXxxJob` throws QUEUE_UNAVAILABLE so the
 * caller can surface that to the user.
 *
 * `verifyPublishQueue()` and `verifyIngestQueue()` are the boot-time
 * PINGs. They build the connection (if needed) and confirm Redis is
 * reachable, so a bad REDIS_URL shows up in the startup banner
 * instead of as a 503 on the first request.
 */
import { Queue } from "bullmq";
import { Redis, type Redis as RedisType } from "ioredis";
import type { Env } from "@clipflow/config";
import { AppError } from "../errors/AppError.js";

export const YOUTUBE_PUBLISH_QUEUE = "youtube-publish";
export const VIDEO_INGEST_QUEUE = "video-ingest";

let cachedConnection: RedisType | null = null;
let cachedPublishQueue: Queue | null = null;
let cachedIngestQueue: Queue | null = null;

/**
 * Build (or return) the shared Redis connection. Idempotent — first
 * call constructs, subsequent calls return the cached instance.
 */
const getConnection = (env: Env): RedisType | null => {
  if (!env.REDIS_URL) return null;
  if (cachedConnection) return cachedConnection;
  cachedConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    lazyConnect: true,
  });
  cachedConnection.on("error", (err) => {
    // Surfaced here for visibility; verifyXxxQueue() is the
    // authoritative reachability check.
    console.error("[queue] redis error:", err.message);
  });
  return cachedConnection;
};

/**
 * Get (or build) the singleton publish queue. Returns null when Redis
 * is not configured — callers can decide whether that's an error.
 */
export const getPublishQueue = (env: Env): Queue | null => {
  if (!env.REDIS_URL) return null;
  if (cachedPublishQueue) return cachedPublishQueue;
  const conn = getConnection(env);
  if (!conn) return null;
  cachedPublishQueue = new Queue(YOUTUBE_PUBLISH_QUEUE, {
    connection: conn,
    prefix: env.BULLMQ_PREFIX,
  });
  return cachedPublishQueue;
};

/**
 * Get (or build) the singleton ingest queue. Shares the same Redis
 * connection as the publish queue.
 */
export const getIngestQueue = (env: Env): Queue | null => {
  if (!env.REDIS_URL) return null;
  if (cachedIngestQueue) return cachedIngestQueue;
  const conn = getConnection(env);
  if (!conn) return null;
  cachedIngestQueue = new Queue(VIDEO_INGEST_QUEUE, {
    connection: conn,
    prefix: env.BULLMQ_PREFIX,
  });
  return cachedIngestQueue;
};

/**
 * Boot-time reachability check for the BullMQ backing Redis. PINGs
 * the shared connection. Safe to call before any queue usage.
 */
const verifyConnection = async (
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
    const conn = getConnection(env);
    if (!conn) {
      return { ok: false, error: "connection-not-initialized" };
    }
    if (conn.status === "wait" || conn.status === "end") {
      await conn.connect();
    }
    const pong = await conn.ping();
    if (pong !== "PONG") {
      return { ok: false, error: `PING returned unexpected response: ${pong}` };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/** Boot-time reachability check for the publish queue (shared Redis PING). */
export const verifyPublishQueue = (env: Env) => verifyConnection(env);

/** Boot-time reachability check for the ingest queue (shared Redis PING). */
export const verifyIngestQueue = (env: Env) => verifyConnection(env);

/**
 * Enqueue a `youtube-publish` job for a Video. Uses a deterministic
 * `jobId` so re-enqueuing the same video (e.g. on a finalize retry)
 * dedupes instead of duplicating.
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
 * Enqueue a `video-ingest` job for a Video. Uses a deterministic
 * `jobId` (`ingest-${videoId}`) so re-enqueues dedupe — the
 * startup-recovery pass also uses this same id prefix.
 */
export const enqueueIngestJob = async (
  videoId: string,
  env: Env,
): Promise<void> => {
  const queue = getIngestQueue(env);
  if (!queue) {
    throw new AppError(
      503,
      "QUEUE_UNAVAILABLE",
      "REDIS_URL is not configured; cannot enqueue ingest jobs.",
    );
  }
  await queue.add(
    "video-ingest",
    { videoId },
    { jobId: `ingest-${videoId}` },
  );
};

/**
 * Close both queues and the shared Redis connection on graceful
 * shutdown. Order: close queues before disconnecting the connection.
 */
export const closePublishQueue = async (): Promise<void> => {
  if (cachedPublishQueue) {
    await cachedPublishQueue.close();
    cachedPublishQueue = null;
  }
  if (cachedIngestQueue) {
    await cachedIngestQueue.close();
    cachedIngestQueue = null;
  }
  if (cachedConnection) {
    cachedConnection.disconnect();
    cachedConnection = null;
  }
};
