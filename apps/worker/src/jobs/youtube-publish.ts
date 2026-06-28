/**
 * Worker job: publish a Video row to YouTube.
 *
 * Wraps `publishVideo` from `@clipflow/youtube-upload`. Classifies
 * errors: permanent failures (PermanentPublishError) are recorded
 * on the Video row and swallowed so BullMQ doesn't retry; transient
 * failures (TransientPublishError, network) are rethrown so BullMQ
 * applies its exponential backoff retry policy.
 *
 * At each lifecycle stage the job publishes SSE events via the
 * WorkerEventPublisher so the frontend receives real-time progress.
 */
import type { Job } from "bullmq";
import type { Env } from "@clipflow/config";
import {
  PermanentPublishError,
  publishVideo,
  TransientPublishError,
  uploadVideoThumbnail,
} from "@clipflow/youtube-upload";
import { prisma } from "@clipflow/db";
import type { Logger } from "../config/logger.js";
import type { EventPublisher } from "../lib/events.js";

export interface PublishJobData {
  videoId: string;
}

export interface ProcessContext {
  env: Env;
  logger: Logger;
  events?: EventPublisher;
}

/**
 * Build the timestamp string used in every SSE event.
 */
const nowISO = (): string => new Date().toISOString();

/**
 * Process one `youtube-publish` BullMQ job.
 */
export const processYoutubePublishJob = async (
  job: Job<PublishJobData>,
  ctx: ProcessContext,
): Promise<void> => {
  const { videoId } = job.data;
  ctx.logger.info(
    { jobId: job.id, videoId, attempt: job.attemptsMade + 1 },
    "Starting YouTube publish job",
  );

  // Look up the userId for event channel routing. Best-effort — if the
  // row vanishes between enqueue and execution we skip events rather
  // than crash (publishVideo handles the actual failure).
  const video = await prisma.video
    .findUnique({
      where: { id: videoId },
      select: { userId: true, status: true },
    })
    .catch(() => null);

  const userId = video?.userId ?? "";
  const canPublish = !!userId && !!ctx.events;

  if (canPublish) {
    void ctx.events!.publish({
      type: "PROGRESS",
      videoId,
      userId,
      progress: 0,
      stage: "Starting YouTube upload",
      timestamp: nowISO(),
    });
  }

  let youtubeVideoId: string | undefined;

  try {
    const result = await publishVideo(
      { videoId },
      { prisma, env: ctx.env, logger: ctx.logger },
    );
    youtubeVideoId = result.youtubeVideoId;

    if (canPublish) {
      void ctx.events!.publish({
        type: "STATUS_UPDATE",
        videoId,
        userId,
        status: "PUBLISHED",
        timestamp: nowISO(),
      });
    }
  } catch (err) {
    if (err instanceof PermanentPublishError) {
      await prisma.video
        .update({
          where: { id: videoId },
          data: {
            status: "PUBLISH_FAILED",
            failureReason: `[${err.reasonCode}] ${err.message}`,
          },
        })
        .catch(() => {});

      if (canPublish) {
        void ctx.events!.publish({
          type: "STATUS_UPDATE",
          videoId,
          userId,
          status: "PUBLISH_FAILED",
          timestamp: nowISO(),
        });
        void ctx.events!.publish({
          type: "ERROR",
          videoId,
          userId,
          error: `[${err.reasonCode}] ${err.message}`,
          timestamp: nowISO(),
        });
      }

      ctx.logger.warn(
        { videoId, reasonCode: err.reasonCode, message: err.message },
        "Publish failed permanently; not retrying",
      );
      return;
    }

    if (err instanceof TransientPublishError) {
      if (canPublish) {
        void ctx.events!.publish({
          type: "ERROR",
          videoId,
          userId,
          error: `Transient error (attempt ${job.attemptsMade + 1}): ${err.message}`,
          timestamp: nowISO(),
        });
      }

      ctx.logger.warn(
        { videoId, message: err.message },
        "Publish failed transiently; BullMQ will retry",
      );
      throw err;
    }

    if (canPublish) {
      void ctx.events!.publish({
        type: "ERROR",
        videoId,
        userId,
        error: `Unexpected error (attempt ${job.attemptsMade + 1}): ${err instanceof Error ? err.message : String(err)}`,
        timestamp: nowISO(),
      });
    }

    ctx.logger.error(
      { videoId, err: err instanceof Error ? err.message : String(err) },
      "Unknown error in publish job; treating as transient",
    );
    throw err;
  }

  // ---- Custom thumbnail upload (best-effort) ----
  //
  // This runs AFTER publishVideo resolves (or short-circuits for
  // already-PUBLISHED videos on retry). The video is live on YouTube;
  // a thumbnail failure is logged but never blocks the job or triggers
  // a BullMQ retry. On retry the thumbnail gets another attempt because
  // uploadVideoThumbnail is called unconditionally here.
  if (youtubeVideoId) {
    try {
      await uploadVideoThumbnail(
        { videoId, youtubeVideoId },
        { prisma, env: ctx.env, logger: ctx.logger },
      );
    } catch (err) {
      ctx.logger.warn(
        {
          videoId,
          err: err instanceof Error ? err.message : String(err),
        },
        "Thumbnail upload failed; video is published using YouTube's default thumbnail.",
      );
    }
  }
};