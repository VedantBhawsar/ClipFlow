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
 *
 * Companion: `unpublishVideo` flips a live video's `privacyStatus`
 * back to `private` via `videos.update`. The DB row's `privacyStatus`
 * column is updated to mirror what YouTube now reports, so the UI
 * can render an honest "Unpublished on YouTube" state without a
 * second round-trip.
 */
import type { Env } from "@clipflow/config";
import type { Logger } from "pino";
import type { PrismaClient } from "@prisma/client";
import { buildS3Config, getObjectStream, getS3Client } from "@clipflow/s3";
import { PermanentPublishError } from "./errors.js";
import { refreshAccessToken } from "./token-refresh.js";
import {
  setYouTubeThumbnail,
  startResumableUploadSession,
  toYouTubeLicense,
  updateVideoStatus,
  uploadVideoBytes,
} from "./youtube-api.js";

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
    status: buildStatusFromVideo(video),
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

  // ---- Custom thumbnail (optional) ----
  //
  // YouTube's `thumbnails.set` needs the bytes AFTER `videos.insert`
  // returns the youtubeVideoId — the thumbnail can't be uploaded
  // until YouTube knows about the video. We stream the S3 object
  // straight through so we don't buffer a 2 MB image in memory.
  //
  // Thumbnail failures are logged but DON'T fail the publish — the
  // video is live with YouTube's default frame, which is still a
  // valid outcome. Transient errors get retried by BullMQ (we
  // re-throw); permanent ones are swallowed + logged so a bad
  // thumbnail can't undo a successful publish.
  if (video.s3KeyThumbnail && video.thumbnailContentType) {
    const thumbContentType = video.thumbnailContentType as "image/jpeg" | "image/png";
    if (thumbContentType === "image/jpeg" || thumbContentType === "image/png") {
      try {
        const { body: thumbBody, contentLength: thumbLength } = await getObjectStream(
          client,
          s3,
          video.s3KeyThumbnail,
        );
        const webThumb = (
          thumbBody as unknown as { transformToWebStream(): ReadableStream<Uint8Array> }
        ).transformToWebStream();
        await setYouTubeThumbnail({
          accessToken,
          youtubeVideoId: uploaded.youtubeVideoId,
          body: webThumb,
          contentLength: thumbLength,
          contentType: thumbContentType,
        });
        logger.info(
          { videoId: video.id, s3KeyThumbnail: video.s3KeyThumbnail },
          "Custom thumbnail uploaded to YouTube.",
        );
      } catch (err) {
        const reason =
          err instanceof PermanentPublishError
            ? `permanent: ${err.message}`
            : err instanceof Error
              ? `transient: ${err.message}`
              : "unknown error";
        logger.warn(
          { videoId: video.id, err: reason },
          "Thumbnail upload failed; video is published but using YouTube's default thumbnail.",
        );
        if (!(err instanceof PermanentPublishError)) {
          // Transient → let BullMQ retry. Permanent → swallow (see above).
          throw err;
        }
      }
    }
  }

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
 * Flip a live (PUBLISHED) video's `privacyStatus` back to `private` on
 * YouTube and mirror that on the row. The DB update is conditional on
 * the row still being PUBLISHED so a concurrent retry doesn't silently
 * flip it back. The row keeps `status = "PUBLISHED"` — a "live but
 * private" video is still a published video from ClipFlow's POV; the
 * `privacyStatus` column carries the YouTube-side truth.
 *
 * @throws PermanentPublishError for unknown id, not-owned id, or
 *   not-yet-published rows. YouTube-side errors are surfaced as
 *   TransientPublishError / PermanentPublishError via `updateVideoStatus`.
 */
export const unpublishVideo = async (
  input: PublishVideoInput,
  ctx: PublishVideoContext,
): Promise<void> => {
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
  if (video.status !== "PUBLISHED") {
    throw new PermanentPublishError(
      "VIDEO_NOT_PUBLISHED",
      `Video ${video.id} is ${video.status}, not PUBLISHED.`,
    );
  }
  if (!video.youtubeVideoId) {
    // The DB invariant says PUBLISHED implies a youtubeVideoId, but a
    // half-migrated row could break that. Treat as not-published so
    // the UI surfaces a recoverable error instead of a 500.
    throw new PermanentPublishError(
      "VIDEO_NOT_PUBLISHED",
      `Video ${video.id} has no YouTube id yet.`,
    );
  }
  if (video.youtubeChannel.status !== "CONNECTED") {
    throw new PermanentPublishError(
      "CHANNEL_NOT_CONNECTED",
      `Channel ${video.youtubeChannel.id} is ${video.youtubeChannel.status}.`,
    );
  }

  const refreshed = await refreshAccessToken(prisma, video.youtubeChannel, env);

  await updateVideoStatus(refreshed.accessToken, video.youtubeVideoId, {
    privacyStatus: "private",
    // YouTube rejects `publishAt` paired with `private`; the unpublish
    // path is a status flip, not a re-schedule, so leave it out.
    selfDeclaredMadeForKids: video.madeForKids,
    ageRestriction: video.ageRestriction,
    embeddable: video.embeddable,
    // Internal `VideoLicense` ("standard") is not a YouTube-API value;
    // translate at the boundary so we don't get a 400 INVALID_METADATA.
    license: toYouTubeLicense(video.license),
    publicStatsViewable: video.publicStatsViewable,
    commentPolicy: video.commentPolicy,
  });

  await prisma.video.update({
    where: { id: video.id },
    data: { privacyStatus: "private" },
  });

  logger.info(
    { videoId: video.id, youtubeVideoId: video.youtubeVideoId },
    "Video unpublished on YouTube.",
  );
};

/**
 * Project a Video row into the shape `startResumableUploadSession`
 * expects on the `status` block. Centralised so publishVideo and
 * unpublishVideo can't drift on which fields they send.
 *
 * The `license` field is translated from our internal `VideoLicense`
 * enum to YouTube's API value here — the DB row stores `"standard"`
 * but YouTube rejects that with 400 INVALID_METADATA, expecting
 * `"youtube"`.
 */
const buildStatusFromVideo = (video: {
  privacyStatus: string;
  scheduledPublishAt: Date | null;
  madeForKids: boolean;
  ageRestriction: string;
  embeddable: boolean;
  license: string;
  publicStatsViewable: boolean;
  commentPolicy: string;
}) => ({
  privacyStatus: video.privacyStatus as "private" | "unlisted" | "public",
  ...(video.scheduledPublishAt
    ? { publishAt: video.scheduledPublishAt.toISOString() }
    : {}),
  selfDeclaredMadeForKids: video.madeForKids,
  ageRestriction: video.ageRestriction,
  embeddable: video.embeddable,
  license: toYouTubeLicense(video.license),
  publicStatsViewable: video.publicStatsViewable,
  commentPolicy: video.commentPolicy,
});

/**
 * Re-export the error classes so callers (worker) can `instanceof`-check.
 */
export { PermanentPublishError, TransientPublishError } from "./errors.js";
