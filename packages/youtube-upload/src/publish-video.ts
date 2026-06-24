/**
 * Publish a Video row to YouTube. Used by both the API (immediate path
 * inside finalizeUpload) and the worker (scheduled path on BullMQ).
 *
 * Flow:
 *   1. Load Video + YouTubeChannel. 412 if channel isn't CONNECTED.
 *   2. Mark `status = PUBLISHING`.
 *   3. refreshAccessToken(channel) → accessToken.
 *   4. startResumableUploadSession(metadata) → sessionUrl.
 *   5. Stream the S3 object body into uploadVideoBytes(sessionUrl).
 *   6. Mark `status = PUBLISHED`, save `youtubeVideoId` + `publishedAt`.
 *
 * Errors are classified by `startResumableUploadSession` and
 * `uploadVideoBytes`. The DB is updated to PUBLISH_FAILED on
 * permanent failure; transient failures are re-thrown so BullMQ retries.
 */
import type { Env } from "@clipflow/config";
import type { Logger } from "pino";
import type { PrismaClient } from "@prisma/client";
import { buildS3Config, getObjectStream, getS3Client } from "@clipflow/s3";
import { PermanentPublishError } from "./errors.js";
import { refreshAccessToken } from "./token-refresh.js";
import { startResumableUploadSession, uploadVideoBytes } from "./youtube-api.js";

export interface PublishVideoContext {
  prisma: PrismaClient;
  env: Env;
  logger: Logger;
}

export interface PublishVideoInput {
  videoId: string;
}

export interface PublishVideoResult {
  youtubeVideoId: string;
  publishedAt: Date;
}

/**
 * Publish the video to YouTube.
 *
 * @param input.videoId The internal Video row id.
 * @param ctx Prisma + env + logger.
 * @returns The new YouTube video id and the publish timestamp.
 */
export const publishVideo = async (
  input: PublishVideoInput,
  ctx: PublishVideoContext,
): Promise<PublishVideoResult> => {
  const { prisma, env, logger } = ctx;

  const video = await prisma.video.findUnique({
    where: { id: input.videoId },
    include: { youtubeChannel: true },
  });
  if (!video) {
    throw new PermanentPublishError(
      "VIDEO_NOT_FOUND",
      `Video ${input.videoId} not found.`,
    );
  }

  if (video.status === "PUBLISHED") {
    logger.info(
      { videoId: video.id, youtubeVideoId: video.youtubeVideoId },
      "Video already published — skipping.",
    );
    return {
      youtubeVideoId: video.youtubeVideoId ?? "",
      publishedAt: video.publishedAt ?? new Date(),
    };
  }

  if (video.status === "PUBLISH_FAILED") {
    // The worker should not retry past the configured attempts; if we
    // get here it's because someone re-enqueued manually. Treat as fresh.
    logger.info({ videoId: video.id }, "Retrying a previously failed publish.");
  }

  if (video.youtubeChannel.status !== "CONNECTED") {
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: "PUBLISH_FAILED",
        failureReason: "YouTube channel is not connected.",
      },
    });
    throw new PermanentPublishError(
      "CHANNEL_NOT_CONNECTED",
      `Channel ${video.youtubeChannel.id} is ${video.youtubeChannel.status}.`,
    );
  }

  // Mark PUBLISHING. If this fails we don't want to leave a half-state.
  await prisma.video.update({
    where: { id: video.id },
    data: { status: "PUBLISHING", failureReason: null },
  });

  let accessToken: string;
  try {
    const refreshed = await refreshAccessToken(prisma, video.youtubeChannel, env);
    accessToken = refreshed.accessToken;
  } catch (err) {
    if (err instanceof PermanentPublishError) {
      await prisma.video.update({
        where: { id: video.id },
        data: {
          status: "PUBLISH_FAILED",
          failureReason: `Channel needs reauth: ${err.message}`,
        },
      });
    }
    throw err;
  }

  // Step 1: ask YouTube for a resumable session.
  const sessionUrl = await startResumableUploadSession({
    accessToken,
    metadata: {
      title: video.title,
      description: video.description ?? "",
      tags: video.tags,
      categoryId: video.categoryId,
    },
    status: {
      privacyStatus: video.privacyStatus as
        | "private"
        | "unlisted"
        | "public",
      ...(video.scheduledPublishAt
        ? { publishAt: video.scheduledPublishAt.toISOString() }
        : {}),
    },
    contentLength: Number(video.fileSizeBytes),
    contentType: video.contentType,
  });

  // Step 2: stream the S3 object body into the resumable session URL.
  const s3 = buildS3Config(env);
  const client = getS3Client(s3);
  const { body, contentLength } = await getObjectStream(
    client,
    s3,
    video.s3KeyOriginal,
  );

  // Convert the SDK's SdkStream to a Web ReadableStream that fetch can
  // consume. `transformToWebStream()` is provided by the smithy SDK
  // mixin and is the supported cross-runtime conversion path.
  // The cast is needed because the SDK's overload narrows by
  // `@smithy/signature-v4`'s conditional types; at runtime it's
  // always a ReadableStream in Node.
  const webBody = (
    body as unknown as { transformToWebStream(): ReadableStream<Uint8Array> }
  ).transformToWebStream();

  const uploaded = await uploadVideoBytes({
    sessionUrl,
    body: webBody,
    contentLength,
    contentType: video.contentType,
  });

  const publishedAt = new Date();
  await prisma.video.update({
    where: { id: video.id },
    data: {
      status: "PUBLISHED",
      youtubeVideoId: uploaded.youtubeVideoId,
      publishedAt,
      failureReason: null,
    },
  });

  logger.info(
    {
      videoId: video.id,
      youtubeVideoId: uploaded.youtubeVideoId,
      title: video.title,
    },
    "Video published to YouTube.",
  );

  return { youtubeVideoId: uploaded.youtubeVideoId, publishedAt };
};

/**
 * Re-export the error classes so callers (worker) can `instanceof`-check.
 */
export { PermanentPublishError, TransientPublishError } from "./errors.js";