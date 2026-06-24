/**
 * Videos service — owns all DB + S3 + YouTube-publish enqueue logic
 * for the upload → publish flow.
 *
 * Lifecycle (v1.1: row created only after upload is confirmed):
 *
 *   POST   /api/videos                       → mints `pendingUploadId`,
 *                                              presigned POST URL, and
 *                                              stores metadata in cache.
 *                                              **No DB row yet.**
 *   POST   /api/videos/pending/:id/upload-url → fresh presigned POST
 *                                              (cache lookup, not DB).
 *   POST   /api/videos/pending/:id/finalize  → HEADs S3, validates size,
 *                                              creates the `Video` row,
 *                                              transitions to READY or
 *                                              SCHEDULED, enqueues job.
 *                                              No row if S3 has no object
 *                                              or size mismatches.
 *   DELETE /api/videos/pending/:id           → cancel an in-flight upload;
 *                                              best-effort S3 delete +
 *                                              cache eviction.
 *   GET    /api/videos                       → list committed videos.
 *   GET    /api/videos/:id                   → single committed video.
 *   DELETE /api/videos/:id                   → cancel a not-yet-published
 *                                              committed video.
 *
 * The two-step create→finalize flow is deliberate: the browser PUTs the
 * file directly to S3 (the API never sees the bytes) and only after the
 * bytes are confirmed in place does the API commit a row. This means an
 * abandoned upload (closed tab, network error, partial PUT) leaves zero
 * residue in the DB and the dashboard stays honest.
 *
 * The status transitions are deliberately conservative: PUBLISHED rows
 * are immutable in v1 (YouTube is the source of truth). A future slice
 * can re-fetch state if needed.
 */
import { randomUUID } from "node:crypto";
import type { Env } from "@clipflow/config";
import type {
  CreateVideoResponse,
  UploadUrlResponse,
  Video,
  VideoStatus,
} from "@clipflow/types";
import {
  buildS3Config,
  createPresignedPostUrl,
  deleteObject,
  getS3Client,
  headObject,
} from "@clipflow/s3";
import { publishVideo } from "@clipflow/youtube-upload";
import { pino } from "pino";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { cache } from "../../lib/cache.js";
import { enqueuePublishJob } from "../../lib/queue.js";
import { toVideoDto } from "./videos.types.js";
import type { CreateVideoInput } from "./videos.schemas.js";

const ALLOWED_DELETE_STATUSES: ReadonlySet<VideoStatus> = new Set([
  "UPLOADED",
  "READY",
  "SCHEDULED",
  "PUBLISH_FAILED",
]);

/**
 * Cache-key namespace for in-flight uploads. The TTL matches the
 * presigned-URL TTL (`env.YOUTUBE_PRESIGNED_POST_TTL`) so a stale
 * presigned URL also produces a cache miss, which is the signal to
 * the client that the upload must be re-prepared from scratch.
 */
const PENDING_UPLOAD_KEY_PREFIX = "pendingUpload:";

/**
 * Shape of the JSON blob stored under `pendingUpload:<id>`. The server
 * is the source of truth for these fields between `createVideo` and
 * `finalizeUpload`; the client only sees the `pendingUploadId` handle.
 */
interface PendingUpload {
  userId: string;
  channelId: string;
  s3KeyOriginal: string;
  contentType: string;
  fileSizeBytes: number;
  metadata: {
    title: string;
    description: string | null;
    tags: string[];
    categoryId: string;
    privacyStatus: string;
    originalFilename: string;
    scheduledPublishAt: string | null;
  };
}

/**
 * Validate a YouTube channel is present and ready before we let the
 * user kick off an upload. Mirrors the checks the old `createVideo`
 * performed; hoisted so `createVideo` and any future `retry` endpoint
 * can share them.
 */
const requireConnectedChannel = async (
  userId: string,
): Promise<{ id: string }> => {
  const channel = await prisma.youTubeChannel.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!channel) {
    throw new AppError(
      412,
      "YOUTUBE_NOT_CONNECTED",
      "Connect your YouTube channel before uploading videos.",
    );
  }
  if (channel.status !== "CONNECTED") {
    throw new AppError(
      412,
      "YOUTUBE_NEEDS_REAUTH",
      "Your YouTube channel needs to be reconnected.",
    );
  }
  return { id: channel.id };
};

/**
 * Mint a `pendingUploadId`, a presigned S3 POST URL, and stash the
 * metadata in cache. Returns the handle the browser uses for the
 * subsequent PUT + finalize.
 *
 * Crucially, this does NOT create a `Video` row. The row is created in
 * `finalizeUpload` only after the API has confirmed the bytes landed
 * in S3. This eliminates the "UPLOADED row with no file" failure mode.
 */
export const createVideo = async (
  userId: string,
  input: CreateVideoInput,
  env: Env,
): Promise<CreateVideoResponse> => {
  requireDatabase();

  const channel = await requireConnectedChannel(userId);

  const s3 = buildS3Config(env);
  const client = getS3Client(s3);
  const pendingUploadId = `pu_${randomUUID()}`;
  const ext = inferExtension(input.originalFilename, input.contentType);
  // The `pending/` prefix scopes partial uploads so a future S3
  // lifecycle rule (e.g. expire after 24h) can clean them up without
  // touching the committed path.
  const s3KeyOriginal = `videos/${userId}/pending/${pendingUploadId}/original.${ext}`;

  const presigned = await createPresignedPostUrl(client, s3, {
    key: s3KeyOriginal,
    contentType: input.contentType,
    contentLengthMaxBytes: env.YOUTUBE_MAX_VIDEO_BYTES,
    expiresInSeconds: env.YOUTUBE_PRESIGNED_POST_TTL,
  });

  const pending: PendingUpload = {
    userId,
    channelId: channel.id,
    s3KeyOriginal,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
    metadata: {
      title: input.title,
      description: input.description ?? null,
      tags: input.tags,
      categoryId: input.categoryId,
      privacyStatus: input.privacyStatus,
      originalFilename: input.originalFilename,
      scheduledPublishAt: input.scheduledPublishAt
        ? new Date(input.scheduledPublishAt).toISOString()
        : null,
    },
  };
  await cache.set(
    `${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`,
    JSON.stringify(pending),
    env.YOUTUBE_PRESIGNED_POST_TTL,
  );

  return {
    pendingUploadId,
    s3KeyOriginal,
    postUrl: presigned.postUrl,
    fields: presigned.fields,
    contentLengthMaxBytes: presigned.contentLengthMaxBytes,
  };
};

/**
 * Mint a fresh presigned POST URL for an in-flight upload. Useful when
 * the first URL expired (15 min default) before the browser finished a
 * slow upload. Cache miss → 404 so the client knows to re-prepare
 * (which gets a fresh `pendingUploadId` and starts the cache entry
 * over).
 */
export const getUploadUrl = async (
  userId: string,
  pendingUploadId: string,
  env: Env,
): Promise<UploadUrlResponse> => {
  requireDatabase();
  const pending = await loadPendingUploadForOwner(userId, pendingUploadId);
  const s3 = buildS3Config(env);
  const client = getS3Client(s3);
  const presigned = await createPresignedPostUrl(client, s3, {
    key: pending.s3KeyOriginal,
    contentType: pending.contentType,
    contentLengthMaxBytes: env.YOUTUBE_MAX_VIDEO_BYTES,
    expiresInSeconds: env.YOUTUBE_PRESIGNED_POST_TTL,
  });
  return {
    postUrl: presigned.postUrl,
    fields: presigned.fields,
    contentLengthMaxBytes: presigned.contentLengthMaxBytes,
  };
};

/**
 * Confirm a finished S3 upload and commit the `Video` row.
 *
 * Order of operations (and why):
 *  1. Cache lookup. If missing → 404 (`UPLOAD_NOT_FOUND`); the upload
 *     is too old, was cancelled, or never existed.
 *  2. Ownership check. Foreign id → 404 (don't leak existence).
 *  3. S3 HEAD. No object → 404 (bytes never landed). Size mismatch →
 *     `UPLOAD_INCOMPLETE` (partial PUT) — clean up S3 + cache so the
 *     next attempt starts fresh. Oversize → `FILE_TOO_LARGE` — same.
 *  4. Create the row in `UPLOADED`, then transition to `READY` or
 *     `SCHEDULED`, enqueue the publish job if immediate.
 *  5. `cache.del` the pending entry.
 *
 * If any of (1)–(3) fail, no row is created. Step (4) is the only path
 * that writes to the DB; if Prisma throws there we let it surface as a
 * 500 and the cache entry stays so a retry can attempt finalize again
 * (but in practice the row creation failure is unrecoverable and the
 * cache will TTL out).
 */
export const finalizeUpload = async (
  userId: string,
  pendingUploadId: string,
  env: Env,
): Promise<Video> => {
  requireDatabase();
  const pending = await loadPendingUploadForOwner(userId, pendingUploadId);

  const s3 = buildS3Client(env);
  const head = await headObject(s3.client, s3.config, pending.s3KeyOriginal);
  if (!head) {
    await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Your upload didn't reach storage. Please try again.",
    );
  }

  if (head.contentLength !== pending.fileSizeBytes) {
    // Partial PUT — the presigned POST allows 0..maxBytes, so a network
    // drop can leave a smaller object. Clean it up so re-upload doesn't
    // surface as a 412 on a stale key.
    await deleteObject(s3.client, s3.config, pending.s3KeyOriginal).catch(() => {
      // best-effort cleanup
    });
    await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
    throw new AppError(
      400,
      "UPLOAD_INCOMPLETE",
      "Your upload was interrupted. Please re-upload.",
    );
  }

  if (head.contentLength > env.YOUTUBE_MAX_VIDEO_BYTES) {
    await deleteObject(s3.client, s3.config, pending.s3KeyOriginal).catch(() => {
      // best-effort cleanup
    });
    await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      `File exceeds the ${formatBytes(env.YOUTUBE_MAX_VIDEO_BYTES)} limit.`,
    );
  }

  const videoId = `vid_${randomUUID()}`;
  const video = await prisma.video.create({
    data: {
      id: videoId,
      userId: pending.userId,
      youtubeChannelId: pending.channelId,
      title: pending.metadata.title,
      description: pending.metadata.description,
      tags: pending.metadata.tags,
      categoryId: pending.metadata.categoryId,
      privacyStatus: pending.metadata.privacyStatus,
      originalFilename: pending.metadata.originalFilename,
      fileSizeBytes: BigInt(head.contentLength),
      contentType: head.contentType ?? pending.contentType,
      s3KeyOriginal: pending.s3KeyOriginal,
      scheduledPublishAt: pending.metadata.scheduledPublishAt
        ? new Date(pending.metadata.scheduledPublishAt)
        : null,
      status: "UPLOADED",
    },
  });

  const scheduledAt = video.scheduledPublishAt;
  const isScheduled = !!scheduledAt && scheduledAt.getTime() > Date.now();
  const nextStatus: VideoStatus = isScheduled ? "SCHEDULED" : "READY";

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: { status: nextStatus },
  });

  if (!isScheduled) {
    await enqueuePublishJob(video.id, null, env);
  }

  await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);

  return toVideoDto(updated);
};

/**
 * Cancel an in-flight upload: best-effort S3 delete + cache eviction.
 * Idempotent — a missing cache entry returns 204 (treat as already
 * cancelled) so retries from a flaky network don't surface as 404s.
 */
export const cancelPendingUpload = async (
  userId: string,
  pendingUploadId: string,
  env: Env,
): Promise<void> => {
  requireDatabase();
  const raw = await cache.get(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
  if (!raw) {
    // Already gone (TTL'd or already cancelled) — nothing to do.
    return;
  }
  let pending: PendingUpload;
  try {
    pending = JSON.parse(raw) as PendingUpload;
  } catch {
    // Corrupt entry — clean it up and bail.
    await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
    return;
  }
  if (pending.userId !== userId) {
    // Don't reveal that the id exists for another user.
    return;
  }
  const s3 = buildS3Client(env);
  await deleteObject(s3.client, s3.config, pending.s3KeyOriginal).catch(() => {
    // best-effort; the cache eviction below is the source of truth.
  });
  await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
};

/**
 * Cancel + delete a committed, not-yet-published video. Removes the
 * S3 object (best-effort) and the DB row. Unchanged from the pre-fix
 * flow.
 */
export const deleteVideo = async (
  userId: string,
  videoId: string,
  env: Env,
): Promise<void> => {
  requireDatabase();
  const video = await loadVideoForOwner(userId, videoId);
  if (!ALLOWED_DELETE_STATUSES.has(video.status as VideoStatus)) {
    throw new AppError(
      409,
      "VIDEO_NOT_DELETABLE",
      "Published videos can't be deleted from ClipFlow — manage them on YouTube.",
    );
  }
  const s3 = buildS3Client(env);
  await deleteObject(s3.client, s3.config, video.s3KeyOriginal).catch(() => {
    // best-effort; the DB row is the source of truth for the user
  });
  await prisma.video.delete({ where: { id: video.id } });
};

/**
 * List the current user's committed videos, newest first. Pending
 * uploads are intentionally not visible — they live in the dialog
 * state and have no DB row.
 */
export const listVideos = async (userId: string): Promise<Video[]> => {
  requireDatabase();
  const rows = await prisma.video.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toVideoDto);
};

/**
 * Read a single committed video, scoped to the owner.
 */
export const getVideo = async (userId: string, videoId: string): Promise<Video> => {
  requireDatabase();
  const video = await loadVideoForOwner(userId, videoId);
  return toVideoDto(video);
};

/**
 * Re-export for the immediate-publish path. The controller calls this
 * for videos with no `scheduledPublishAt` so we publish synchronously
 * rather than waiting for the worker to pick up a fresh job.
 *
 * Currently unused in the controller — finalizeUpload always enqueues
 * because we want the request to return quickly. Exported so a future
 * "publish now" UI button can use it.
 */
export const publishVideoNow = async (
  userId: string,
  videoId: string,
  env: Env,
): Promise<Video> => {
  requireDatabase();
  await loadVideoForOwner(userId, videoId);
  await publishVideo(
    { videoId },
    { prisma, env, logger: buildConsoleLogger("api") },
  );
  const updated = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
  return toVideoDto(updated);
};

// ---------- internal helpers ----------

const loadPendingUploadForOwner = async (
  userId: string,
  pendingUploadId: string,
): Promise<PendingUpload> => {
  const raw = await cache.get(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
  if (!raw) {
    // Same shape of 404 the old code used for unknown committed videos —
    // hides whether the id ever existed or just expired.
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Your upload didn't reach storage. Please try again.",
    );
  }
  let pending: PendingUpload;
  try {
    pending = JSON.parse(raw) as PendingUpload;
  } catch {
    // Corrupt entry — treat as missing.
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Your upload didn't reach storage. Please try again.",
    );
  }
  if (pending.userId !== userId) {
    // Don't reveal that the id exists for another user.
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Your upload didn't reach storage. Please try again.",
    );
  }
  return pending;
};

const loadVideoForOwner = async (userId: string, videoId: string) => {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }
  if (video.userId !== userId) {
    // Treat foreign-id as not-found to avoid leaking existence.
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }
  return video;
};

const buildS3Client = (env: Env) => ({
  config: buildS3Config(env),
  client: getS3Client(buildS3Config(env)),
});

const inferExtension = (filename: string, contentType: string): string => {
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/quicktime") return "mov";
  if (contentType === "video/webm") return "webm";
  return "bin";
};

const formatBytes = (n: number): string => {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${n}B`;
};

/**
 * Minimal pino-shaped logger used when calling publishVideo from the
 * API (which doesn't have a logger in scope here). Keeps the package's
 * log lines coherent with the worker's logs.
 */
const buildConsoleLogger = (service: string) => pino({ base: { service } });
