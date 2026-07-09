import type { Env } from "@clipflow/config";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import {
  enqueueThumbnailsJob,
  enqueueChannelStyleJob,
  enqueuePersonalizedChannelStyleJob,
} from "../../lib/queue.js";
import { toThumbnailDto, toStyleDto } from "./thumbnails.types.js";
import type { ThumbnailDto, ChannelThumbnailStyleDto } from "@clipflow/types";

/**
 * List all thumbnails for a video.
 */
export const listThumbnails = async (
  videoId: string,
  userId: string,
): Promise<ThumbnailDto[]> => {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { userId: true },
  });
  if (!video || video.userId !== userId) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  const rows = await prisma.thumbnail.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map(toThumbnailDto);
};

/**
 * Select a thumbnail as the video's chosen thumbnail.
 */
export const selectThumbnail = async (
  videoId: string,
  thumbnailId: string,
  userId: string,
): Promise<ThumbnailDto> => {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { userId: true },
  });
  if (!video || video.userId !== userId) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  const thumbnail = await prisma.thumbnail.findUnique({
    where: { id: thumbnailId },
  });
  if (!thumbnail || thumbnail.videoId !== videoId) {
    throw new AppError(404, "THUMBNAIL_NOT_FOUND", "Thumbnail not found for this video.");
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { selectedThumbnailId: thumbnailId },
  });

  return toThumbnailDto(thumbnail);
};

/**
 * Regenerate thumbnails for a video. Checks email verification before
 * allowing generation. Enqueues a new thumbnails job.
 */
export const regenerateThumbnails = async (
  videoId: string,
  userId: string,
  emailVerifiedAt: Date | null,
  env: Env,
): Promise<{ generationId: string }> => {
  // Email verification check — YouTube requires verified accounts
  // for publishing and certain API operations.
  if (!emailVerifiedAt) {
    throw new AppError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Email verification required before generating thumbnails. Please verify your email address in settings.",
    );
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { userId: true, status: true },
  });
  if (!video || video.userId !== userId) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  if (video.status !== "GENERATING" && video.status !== "READY_FOR_REVIEW") {
    throw new AppError(
      409,
      "INVALID_VIDEO_STATUS",
      `Cannot regenerate thumbnails for video in ${video.status} state. Video must be in GENERATING or READY_FOR_REVIEW.`,
    );
  }

  const generation = await prisma.thumbnailGeneration.create({
    data: {
      videoId,
      status: "PENDING",
      promptText: "Manual regeneration request",
      modelUsed: env.IMAGE_GEN_PROVIDER === "gemini"
        ? env.GEMINI_IMAGE_MODEL
        : env.REPLICATE_IMAGE_MODEL,
    },
  });

  await enqueueThumbnailsJob(videoId, env);

  return { generationId: generation.id };
};

/**
 * Get the channel's thumbnail style profile. Returns null if not yet analyzed.
 */
export const getThumbnailStyle = async (
  userId: string,
): Promise<ChannelThumbnailStyleDto | null> => {
  const style = await prisma.channelThumbnailStyle.findUnique({
    where: { userId },
  });
  return style ? toStyleDto(style) : null;
};

/**
 * Update the channel's thumbnail style override.
 */
export const updateThumbnailStyle = async (
  userId: string,
  styleOverride: string,
): Promise<ChannelThumbnailStyleDto> => {
  const style = await prisma.channelThumbnailStyle.upsert({
    where: { userId },
    create: { userId, styleOverride: styleOverride as never },
    update: { styleOverride: styleOverride as never },
  });
  return toStyleDto(style);
};

/**
 * Trigger channel style analysis. Enqueues a channel-style-analyze job.
 */
export const triggerStyleAnalysis = async (
  userId: string,
  env: Env,
): Promise<void> => {
  await enqueueChannelStyleJob(userId, env);
};

/**
 * Trigger a personalized channel-style analysis using the user's
 * hand-picked set of thumbnail URLs (1-4). Enqueues the same
 * `channel-style-analyze` worker job, but with the `selectedThumbnailUrls`
 * field set in the payload so the worker skips the `search.list` fetch
 * and analyzes exactly the URLs the user picked.
 *
 * The 1-4 size cap is enforced by the Zod schema in
 * `triggerStyleAnalysisBodySchema`; we re-assert it here as a defense-
 * in-depth check in case the controller is ever called without going
 * through the schema.
 *
 * @throws AppError 412 if the user has no connected YouTube channel —
 *   we can't extract style from URLs that don't exist. Mirrors the
 *   gating the endpoint surfaces on the GET side.
 */
export const triggerPersonalizedStyleAnalysis = async (
  userId: string,
  selectedThumbnailUrls: string[],
  env: Env,
): Promise<{ jobId: string }> => {
  if (selectedThumbnailUrls.length < 1 || selectedThumbnailUrls.length > 4) {
    throw new AppError(
      400,
      "INVALID_SELECTION",
      "Pick between 1 and 4 thumbnails to analyze.",
    );
  }

  const channel = await prisma.youTubeChannel.findUnique({
    where: { userId },
    select: { status: true },
  });
  if (!channel || channel.status !== "CONNECTED") {
    throw new AppError(
      412,
      "YOUTUBE_NOT_CONNECTED",
      "Connect your YouTube channel to analyze your style.",
    );
  }

  await enqueuePersonalizedChannelStyleJob(
    userId,
    selectedThumbnailUrls,
    env,
  );
  return { jobId: `channel-style-personalized-${userId}` };
};
