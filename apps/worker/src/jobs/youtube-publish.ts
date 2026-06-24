/**
 * Worker job: publish a Video row to YouTube.
 *
 * Wraps `publishVideo` from `@clipflow/youtube-upload`. Classifies
 * errors: permanent failures (PermanentPublishError) are recorded
 * on the Video row and swallowed so BullMQ doesn't retry; transient
 * failures (TransientPublishError, network) are rethrown so BullMQ
 * applies its exponential backoff retry policy.
 */
import type { Job } from "bullmq";
import type { Env } from "@clipflow/config";
import {
  PermanentPublishError,
  publishVideo,
  TransientPublishError,
} from "@clipflow/youtube-upload";
import { prisma } from "@clipflow/db";
import type { Logger } from "../config/logger.js";

export interface PublishJobData {
  videoId: string;
}

export interface ProcessContext {
  env: Env;
  logger: Logger;
}

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

  try {
    await publishVideo({ videoId }, { prisma, env: ctx.env, logger: ctx.logger });
  } catch (err) {
    if (err instanceof PermanentPublishError) {
      // publishVideo already updates the Video row to PUBLISH_FAILED for
      // most permanent errors; we belt-and-braces it here so the row is
      // always in a recoverable state even if the package's update was
      // lost (e.g. publishVideo failed before reaching its final update).
      await prisma.video
        .update({
          where: { id: videoId },
          data: {
            status: "PUBLISH_FAILED",
            failureReason: `[${err.reasonCode}] ${err.message}`,
          },
        })
        .catch(() => {
          // best-effort
        });
      ctx.logger.warn(
        { videoId, reasonCode: err.reasonCode, message: err.message },
        "Publish failed permanently; not retrying",
      );
      return; // do not rethrow — BullMQ will not retry
    }

    if (err instanceof TransientPublishError) {
      ctx.logger.warn(
        { videoId, message: err.message },
        "Publish failed transiently; BullMQ will retry",
      );
      throw err; // let BullMQ retry per its backoff
    }

    // Unknown error — treat as transient so we don't silently lose jobs.
    ctx.logger.error(
      { videoId, err: err instanceof Error ? err.message : String(err) },
      "Unknown error in publish job; treating as transient",
    );
    throw err;
  }
};