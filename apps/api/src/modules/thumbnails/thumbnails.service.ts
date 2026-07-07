import type { Env } from "@clipflow/config";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { enqueueThumbnailsJob, enqueueChannelStyleJob } from "../../lib/queue.js";
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
