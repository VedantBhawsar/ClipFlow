/**
 * Videos service — owns all DB + S3 + YouTube-publish enqueue logic
 * for the upload → publish flow.
 *
 * Lifecycle:
 *   POST   /api/videos          → row in UPLOADED, returns presigned POST
 *   POST   /api/videos/:id/upload-url  → fresh presigned POST
 *   POST   /api/videos/:id/finalize    → HEADs S3, transitions to READY
 *                                          (or SCHEDULED), enqueues job
 *                                          (or sets delay)
 *   GET    /api/videos          → list user's videos
 *   GET    /api/videos/:id      → single video
 *   DELETE /api/videos/:id      → cancel a not-yet-published video
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
 * Create a Video row in UPLOADED status and return a presigned POST
 * URL the browser can upload the file to.
 *
 * @param userId Authenticated user id.
 * @param input Validated metadata.
 * @param env Validated env.
 * @returns CreateVideoResponse.
 */
export const createVideo = async (
  userId: string,
  input: CreateVideoInput,
  env: Env,
): Promise<CreateVideoResponse> => {
  requireDatabase();

  const channel = await prisma.youTubeChannel.findUnique({
    where: { userId },
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

  const s3 = buildS3Config(env);
  const client = getS3Client(s3);
  const videoId = `vid_${randomUUID()}`;
  const ext = inferExtension(input.originalFilename, input.contentType);
  const s3KeyOriginal = `videos/${userId}/${videoId}/original.${ext}`;

  const video = await prisma.video.create({
    data: {
      id: videoId,
      userId,
      youtubeChannelId: channel.id,
      title: input.title,
      description: input.description ?? null,
      tags: input.tags,
      categoryId: input.categoryId,
      privacyStatus: input.privacyStatus,
      scheduledPublishAt: input.scheduledPublishAt
        ? new Date(input.scheduledPublishAt)
        : null,
      originalFilename: input.originalFilename,
      // 0 until finalize; server re-validates then.
      fileSizeBytes: BigInt(0),
      contentType: input.contentType,
      s3KeyOriginal,
      status: "UPLOADED",
    },
  });

  const presigned = await createPresignedPostUrl(client, s3, {
    key: s3KeyOriginal,
    contentType: input.contentType,
    contentLengthMaxBytes: env.YOUTUBE_MAX_VIDEO_BYTES,
    expiresInSeconds: env.YOUTUBE_PRESIGNED_POST_TTL,
  });

  return {
    id: video.id,
    s3KeyOriginal: video.s3KeyOriginal,
    postUrl: presigned.postUrl,
    fields: presigned.fields,
    contentLengthMaxBytes: presigned.contentLengthMaxBytes,
  };
};

/**
 * Mint a fresh presigned POST URL for a not-yet-finalized video.
 * Useful when the first URL expires (15 min) before the browser
 * finishes a slow upload.
 */
export const getUploadUrl = async (
  userId: string,
  videoId: string,
  env: Env,
): Promise<UploadUrlResponse> => {
  requireDatabase();
  const video = await loadVideoForOwner(userId, videoId);
  if (video.status !== "UPLOADED") {
    throw new AppError(
      409,
      "UPLOAD_ALREADY_FINALIZED",
      "This video has already been finalized — no more uploads.",
    );
  }
  const s3 = buildS3Config(env);
  const client = getS3Client(s3);
  const presigned = await createPresignedPostUrl(client, s3, {
    key: video.s3KeyOriginal,
    contentType: video.contentType,
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
 * Finalize an upload after the browser has finished the S3 PUT.
 *
 * HEADs the S3 object to confirm size, transitions status, and
 * enqueues the publish job. If the publish target time is in the
 * past or absent, the job is enqueued for immediate execution. If
 * `scheduledPublishAt` is in the future, the job is delayed.
 */
export const finalizeUpload = async (
  userId: string,
  videoId: string,
  env: Env,
): Promise<Video> => {
  requireDatabase();
  const video = await loadVideoForOwner(userId, videoId);
  if (video.status !== "UPLOADED") {
    throw new AppError(
      409,
      "UPLOAD_ALREADY_FINALIZED",
      "This video has already been finalized.",
    );
  }

  const s3 = buildS3Client(env);
  const head = await headObject(s3.client, s3.config, video.s3KeyOriginal);
  if (!head) {
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "We couldn't find the uploaded file. Try uploading again.",
    );
  }

  if (head.contentLength > env.YOUTUBE_MAX_VIDEO_BYTES) {
    // Clean up the oversize object so the user can retry.
    await deleteObject(s3.client, s3.config, video.s3KeyOriginal).catch(() => {
      // best-effort cleanup
    });
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      `File exceeds the ${formatBytes(env.YOUTUBE_MAX_VIDEO_BYTES)} limit.`,
    );
  }

  const scheduledAt = video.scheduledPublishAt;
  const isScheduled = !!scheduledAt && scheduledAt.getTime() > Date.now();

  // Decide the next status. We always advance from UPLOADED to either
  // READY (immediate publish path) or SCHEDULED (future publish path).
  const nextStatus: VideoStatus = isScheduled ? "SCHEDULED" : "READY";

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: {
      status: nextStatus,
      fileSizeBytes: BigInt(head.contentLength),
      ...(head.contentType ? { contentType: head.contentType } : {}),
    },
  });

  // If immediate, enqueue the job now. Otherwise the worker startup-
  // recovery scan will pick it up at scheduled time.
  if (!isScheduled) {
    await enqueuePublishJob(video.id, null, env);
  }

  return toVideoDto(updated);
};

/**
 * Cancel + delete a video that hasn't been published yet. Removes the
 * S3 object (best-effort) and the DB row.
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
 * List the current user's videos, newest first.
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
 * Read a single video, scoped to the owner.
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