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
  formatChaptersForDescription,
  setYouTubeThumbnail,
  startResumableUploadSession,
  toYouTubeLicense,
  updateVideoSnippet,
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

  // Build enriched description with chapters if available.
  // chaptersJson is persisted as `{ summary, chapters[] }` by the
  // generate worker + the API's updateVideo path; pass the inner
  // array, not the wrapper object, otherwise formatChaptersForDescription
  // would walk `.summary` / `.chapters` and emit "NaN:NaN" lines that
  // YouTube can't recognize as timestamps. The legacy bare-array
  // shape (pre-v1.5) is also accepted as a back-compat fallback.
  const chaptersBlock = formatChaptersForDescription(
    extractChapters(video.chaptersJson),
  );

  console.log("chapterBlock", chaptersBlock)
  console.log("video.description", video.description)
  const enrichedDescription = (video.description ?? "") + chaptersBlock;

  // Step 1: ask YouTube for a resumable session.
  const sessionUrl = await startResumableUploadSession({
    accessToken,
    metadata: {
      title: video.title,
      description: enrichedDescription,
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
 * Upload a custom thumbnail to an already-published YouTube video.
 *
 * Designed to be called AFTER `publishVideo` so the thumbnail upload
 * never blocks the publish. Idempotent — YouTube's `thumbnails.set`
 * replaces the existing thumbnail with the new bytes on every call.
 *
 * This is a separate function (not part of `publishVideo`) so the
 * worker can retry it independently without re-publishing the video.
 * When `publishVideo` is retried for a PUBLISHED video it returns
 * early; the thumbnail still gets another attempt because the worker
 * calls this function unconditionally after `publishVideo` resolves.
 *
 * Resolution order for the thumbnail bytes:
 *   1. `Video.selectedThumbnailId` — the AI candidate the user picked
 *      on the review screen. Content type is hard-coded `image/jpeg`
 *      because the thumbnail worker always writes JPEG
 *      (`apps/worker/src/jobs/thumbnails.ts` writes `image/jpeg`).
 *   2. `Video.s3KeyThumbnail` + `Video.thumbnailContentType` — the
 *      user's own upload from the create-video dialog. Used when no
 *      AI selection exists.
 *   3. Otherwise: no-op (the video keeps YouTube's auto-generated
 *      thumbnail).
 *
 * Silently skips when neither source is set or the user's content
 * type is not JPEG/PNG.
 *
 * @throws TransientPublishError — caller should retry.
 * @throws PermanentPublishError — caller should swallow and log.
 */
export const uploadVideoThumbnail = async (
  input: PublishVideoInput & { youtubeVideoId: string },
  ctx: PublishVideoContext,
): Promise<void> => {
  const { prisma, env, logger } = ctx;

  const video = await prisma.video.findUnique({
    where: { id: input.videoId },
    include: { youtubeChannel: true },
  });
  if (!video) return;

  // Resolve which S3 object + content type to upload. See the
  // function-level doc for the order.
  let s3Key: string | null = null;
  let contentType: "image/jpeg" | "image/png" | null = null;
  let source: "AI_GENERATED" | "USER_UPLOADED" | null = null;

  if (video.selectedThumbnailId) {
    // No Prisma relation — the schema explicitly leaves this join
    // to the service layer. A single row lookup keyed by the
    // already-unique `selectedThumbnailId` column.
    const aiThumb = await prisma.thumbnail.findUnique({
      where: { id: video.selectedThumbnailId },
    });
    if (aiThumb && aiThumb.videoId === video.id) {
      s3Key = aiThumb.s3Key;
      // The thumbnail worker writes JPEG for every AI candidate —
      // see `apps/worker/src/jobs/thumbnails.ts` where the putObject
      // call hard-codes "image/jpeg". No DB column to consult.
      contentType = "image/jpeg";
      source = "AI_GENERATED";
    } else {
      logger.warn(
        { videoId: video.id, selectedThumbnailId: video.selectedThumbnailId },
        "Selected thumbnail row missing or mismatched — falling back to user upload.",
      );
    }
  }

  if (!s3Key && video.s3KeyThumbnail && video.thumbnailContentType) {
    s3Key = video.s3KeyThumbnail;
    const ct = video.thumbnailContentType;
    if (ct === "image/jpeg" || ct === "image/png") {
      contentType = ct;
      source = "USER_UPLOADED";
    } else {
      logger.warn(
        { videoId: video.id, contentType: video.thumbnailContentType },
        "Unsupported thumbnail content type — skipping.",
      );
      return;
    }
  }

  if (!s3Key || !contentType) {
    // No custom thumbnail to push — YouTube's auto-generated one
    // stays on the watch page.
    return;
  }

  // Refresh a fresh access token (the one used by publishVideo may have
  // come from a now-revoked context).
  let accessToken: string;
  try {
    const refreshed = await refreshAccessToken(prisma, video.youtubeChannel, env);
    accessToken = refreshed.accessToken;
  } catch (err) {
    if (err instanceof PermanentPublishError) {
      logger.warn(
        { videoId: video.id, err: err.message },
        "Thumbnail upload skipped — channel needs reauth.",
      );
      return;
    }
    throw err;
  }

  const s3 = buildS3Config(env);
  const client = getS3Client(s3);

  let thumbLength: number;
  let webThumb: ReadableStream<Uint8Array>;
  try {
    const { body, contentLength } = await getObjectStream(client, s3, s3Key);
    thumbLength = contentLength;
    webThumb = (
      body as unknown as { transformToWebStream(): ReadableStream<Uint8Array> }
    ).transformToWebStream();
  } catch (err) {
    logger.warn(
      { videoId: video.id, s3Key, err: String(err) },
      "Thumbnail S3 object not found — skipping.",
    );
    return;
  }

  await setYouTubeThumbnail({
    accessToken,
    youtubeVideoId: input.youtubeVideoId,
    body: webThumb,
    contentLength: thumbLength,
    contentType,
  });

  logger.info(
    { videoId: video.id, s3Key, source },
    "Custom thumbnail uploaded to YouTube.",
  );
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
 * Pull the chapter list out of the `chaptersJson` JSON column.
 *
 * The worker (`apps/worker/src/jobs/generate.ts`) and the API
 * (`apps/api/src/modules/videos/videos.service.ts → updateVideo`)
 * persist `chaptersJson` as `{ summary, chapters[] }`. Pre-v1.5
 * rows (or any in-flight rows from before the schema change) had a
 * bare chapter array. Accept either shape so a single payload-pick
 * helper works for both.
 *
 * Returns `null` for missing / malformed shapes — the caller
 * (`formatChaptersForDescription`) treats that as "no chapters".
 */
type ChapterRow = { startMs: number; title: string };
const extractChapters = (
  raw: unknown,
): ChapterRow[] | null | undefined => {
  if (raw == null) return raw;
  // New shape: { summary, chapters[] }
  if (typeof raw === "object") {
    const obj = raw as { chapters?: unknown };
    if (Array.isArray(obj.chapters)) {
      return obj.chapters.filter(
        (c): c is ChapterRow =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as { startMs?: unknown }).startMs === "number" &&
          typeof (c as { title?: unknown }).title === "string",
      );
    }
  }
  // Legacy shape: bare chapter array.
  if (Array.isArray(raw)) {
    return raw.filter(
      (c): c is ChapterRow =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as { startMs?: unknown }).startMs === "number" &&
        typeof (c as { title?: unknown }).title === "string",
    );
  }
  return null;
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
