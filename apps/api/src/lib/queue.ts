/**
 * BullMQ enqueue helpers.
 *
 * The API only enqueues — it never consumes. The worker (apps/worker)
 * is the sole consumer of all four queues: `youtube-publish`,
 * `video-ingest`, `transcription`, and `generate`.
 *
 * All four queues share the same Redis connection
 * (`cachedConnection`) so we don't double up on sockets. If REDIS_URL
 * is missing (dev fallback), `getPublishQueue()` /
 * `getIngestQueue()` / `getTranscriptionQueue()` /
 * `getGenerateQueue()` return null and the corresponding
 * `enqueueXxxJob` throws QUEUE_UNAVAILABLE so the caller can surface
 * that to the user.
 *
 * `verifyPublishQueue()` / `verifyIngestQueue()` /
 * `verifyTranscriptionQueue()` / `verifyGenerateQueue()` are the
 * boot-time PINGs. They all hit the same shared Redis connection, so
 * a bad REDIS_URL shows up in the startup banner instead of as a 503
 * on the first request.
 */
import { Queue } from "bullmq";
import { Redis, type Redis as RedisType } from "ioredis";
import type { Env } from "@clipflow/config";
import { AppError } from "../errors/AppError.js";

export const YOUTUBE_PUBLISH_QUEUE = "youtube-publish";
export const VIDEO_INGEST_QUEUE = "video-ingest";
export const TRANSCRIPTION_QUEUE = "transcription";
export const GENERATE_QUEUE = "generate";
export const THUMBNAILS_QUEUE = "thumbnails";
export const CHANNEL_STYLE_QUEUE = "channel-style-analyze";

let cachedConnection: RedisType | null = null;
let cachedPublishQueue: Queue | null = null;
let cachedIngestQueue: Queue | null = null;
let cachedTranscriptionQueue: Queue | null = null;
let cachedGenerateQueue: Queue | null = null;
let cachedThumbnailsQueue: Queue | null = null;
let cachedChannelStyleQueue: Queue | null = null;

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
 * Get (or build) the singleton transcription queue. Shares the same
 * Redis connection as the publish + ingest queues.
 */
export const getTranscriptionQueue = (env: Env): Queue | null => {
  if (!env.REDIS_URL) return null;
  if (cachedTranscriptionQueue) return cachedTranscriptionQueue;
  const conn = getConnection(env);
  if (!conn) return null;
  cachedTranscriptionQueue = new Queue(TRANSCRIPTION_QUEUE, {
    connection: conn,
    prefix: env.BULLMQ_PREFIX,
  });
  return cachedTranscriptionQueue;
};

/**
 * Get (or build) the singleton generate queue. Shares the same Redis
 * connection as the publish / ingest / transcription queues.
 */
export const getGenerateQueue = (env: Env): Queue | null => {
  if (!env.REDIS_URL) return null;
  if (cachedGenerateQueue) return cachedGenerateQueue;
  const conn = getConnection(env);
  if (!conn) return null;
  cachedGenerateQueue = new Queue(GENERATE_QUEUE, {
    connection: conn,
    prefix: env.BULLMQ_PREFIX,
  });
  return cachedGenerateQueue;
};

/**
 * Get (or build) the singleton thumbnails queue. Shares the same Redis
 * connection as the other queues.
 */
export const getThumbnailsQueue = (env: Env): Queue | null => {
  if (!env.REDIS_URL) return null;
  if (cachedThumbnailsQueue) return cachedThumbnailsQueue;
  const conn = getConnection(env);
  if (!conn) return null;
  cachedThumbnailsQueue = new Queue(THUMBNAILS_QUEUE, {
    connection: conn,
    prefix: env.BULLMQ_PREFIX,
  });
  return cachedThumbnailsQueue;
};

/**
 * Get (or build) the singleton channel-style-analyze queue. Shares the same Redis
 * connection as the other queues.
 */
export const getChannelStyleQueue = (env: Env): Queue | null => {
  if (!env.REDIS_URL) return null;
  if (cachedChannelStyleQueue) return cachedChannelStyleQueue;
  const conn = getConnection(env);
  if (!conn) return null;
  cachedChannelStyleQueue = new Queue(CHANNEL_STYLE_QUEUE, {
    connection: conn,
    prefix: env.BULLMQ_PREFIX,
  });
  return cachedChannelStyleQueue;
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

/** Boot-time reachability check for the transcription queue (shared Redis PING). */
export const verifyTranscriptionQueue = (env: Env) => verifyConnection(env);

/** Boot-time reachability check for the generate queue (shared Redis PING). */
export const verifyGenerateQueue = (env: Env) => verifyConnection(env);

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
 *
 * Note: the API does NOT directly enqueue the follow-up
 * `transcription` job. The `video-ingest` worker enqueues it at the
 * end of its own handler (see `apps/worker/src/jobs/video-ingest.ts`)
 * — that ordering guarantees `s3KeyAudio` is set before transcription
 * starts, so the transcription job can fail-fast with
 * `[AAI_AUDIO_MISSING]` instead of polling.
 *
 * This helper still exists in case a future flow needs to re-enqueue
 * the ingest job without going through the video-create path
 * (e.g. admin retry from a FAILED state).
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
 * Enqueue a `transcription` job for a Video. Uses a deterministic
 * `jobId` (`transcribe-${videoId}`) so re-enqueues dedupe — the
 * startup-recovery pass and the `video-ingest` worker's tail enqueue
 * both use this same id prefix.
 *
 * In the normal flow, the `video-ingest` worker calls this. This
 * helper is exported so admin-style re-enqueue paths (e.g. retry from
 * FAILED) can also fire it without going through ingest.
 */
export const enqueueTranscriptionJob = async (
  videoId: string,
  env: Env,
): Promise<void> => {
  const queue = getTranscriptionQueue(env);
  if (!queue) {
    throw new AppError(
      503,
      "QUEUE_UNAVAILABLE",
      "REDIS_URL is not configured; cannot enqueue transcription jobs.",
    );
  }
  await queue.add(
    "transcription",
    { videoId },
    { jobId: `transcribe-${videoId}` },
  );
};

/**
 * Enqueue a `generate` job for a Video. Uses a deterministic
 * `jobId` (`generate-${videoId}`) so re-enqueues dedupe — the
 * startup-recovery pass and the `transcription` worker's tail enqueue
 * both use this same id prefix.
 *
 * In the normal flow, the `transcription` worker calls this. This
 * helper is exported so admin-style re-enqueue paths (e.g. retry from
 * FAILED) can also fire it without going through transcription.
 */
export const enqueueGenerateJob = async (
  videoId: string,
  env: Env,
): Promise<void> => {
  const queue = getGenerateQueue(env);
  if (!queue) {
    throw new AppError(
      503,
      "QUEUE_UNAVAILABLE",
      "REDIS_URL is not configured; cannot enqueue generate jobs.",
    );
  }
  await queue.add(
    "generate",
    { videoId },
    { jobId: `generate-${videoId}` },
  );
};

/**
 * Enqueue a `thumbnails` job for a Video. Uses a deterministic
 * `jobId` (`thumbnails-${videoId}`) so re-enqueues dedupe.
 */
export const enqueueThumbnailsJob = async (
  videoId: string,
  env: Env,
): Promise<void> => {
  const queue = getThumbnailsQueue(env);
  if (!queue) {
    throw new AppError(
      503,
      "QUEUE_UNAVAILABLE",
      "REDIS_URL is not configured; cannot enqueue thumbnail jobs.",
    );
  }
  await queue.add(
    "thumbnails",
    { videoId },
    { jobId: `thumbnails-${videoId}` },
  );
};

/**
 * Enqueue a `channel-style-analyze` job for a User. Uses a deterministic
 * `jobId` (`channel-style-${userId}`) so re-enqueues dedupe.
 */
export const enqueueChannelStyleJob = async (
  userId: string,
  env: Env,
): Promise<void> => {
  const queue = getChannelStyleQueue(env);
  if (!queue) {
    throw new AppError(
      503,
      "QUEUE_UNAVAILABLE",
      "REDIS_URL is not configured; cannot enqueue channel-style analysis jobs.",
    );
  }
  await queue.add(
    "channel-style-analyze",
    { userId },
    { jobId: `channel-style-${userId}` },
  );
};

/**
 * Close all queues and the shared Redis connection on graceful
 * shutdown. Order: close queues before disconnecting the connection.
 *
 * Misnomer warning: the name says "closePublishQueue" but it closes
 * every queue we own. Kept the name to avoid changing every caller
 * in the same PR that adds the transcription queue.
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
  if (cachedTranscriptionQueue) {
    await cachedTranscriptionQueue.close();
    cachedTranscriptionQueue = null;
  }
  if (cachedGenerateQueue) {
    await cachedGenerateQueue.close();
    cachedGenerateQueue = null;
  }
  if (cachedThumbnailsQueue) {
    await cachedThumbnailsQueue.close();
    cachedThumbnailsQueue = null;
  }
  if (cachedChannelStyleQueue) {
    await cachedChannelStyleQueue.close();
    cachedChannelStyleQueue = null;
  }
  if (cachedConnection) {
    cachedConnection.disconnect();
    cachedConnection = null;
  }
};
