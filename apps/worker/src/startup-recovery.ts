/**
 * Worker startup-recovery scan.
 *
 * Two passes, run in order:
 *
 *   1. `recoverOrphanedPublishingJobs` — videos left in `PUBLISHING`
 *      when a previous worker process died. If a YouTube video id is
 *      already set on the row, the upload most likely completed on
 *      YouTube's side and only the DB flip failed — finalize them to
 *      PUBLISHED. Otherwise reset them to READY so the standard
 *      recovery (and BullMQ's retry policy) can take another swing.
 *
 *   2. `recoverMissedScheduledJobs` — READY/SCHEDULED rows whose
 *      publish time has come and gone, never enqueued or lost when
 *      Redis was flushed. Re-enqueue with a deterministic jobId so
 *      BullMQ dedupes if a stale job is already in the queue.
 *
 * Both passes run on every boot — first boot, worker restart after a
 * crash, and Redis flush / queue data loss.
 */
import type { Queue } from "bullmq";
import { prisma } from "@clipflow/db";
import type { Logger } from "./config/logger.js";
import type { PublishJobData } from "./jobs/youtube-publish.js";

export interface StartupRecoveryReport {
  /** Videos that were PUBLISHING and finalized to PUBLISHED. */
  finalized: number;
  /** Videos that were PUBLISHING and reset to READY for a fresh attempt. */
  reset: number;
  /** Videos re-enqueued from the READY/SCHEDULED recovery pass. */
  reEnqueued: number;
}

/**
 * Reconcile rows orphaned in `PUBLISHING` by a crashed worker.
 *
 * Two outcomes:
 *
 *   - `youtubeVideoId` is set → the resumable upload finished and
 *     YouTube handed back the id; only the final `status = PUBLISHED`
 *     write didn't reach Postgres. Treat the row as published.
 *
 *   - `youtubeVideoId` is null → the upload never reached the point
 *     of YouTube acknowledging the bytes. Step the row back to READY
 *     so the existing recovery pass picks it up via the normal path.
 *
 * Returns `{ finalized, reset }` so the caller can log both buckets.
 */
export const recoverOrphanedPublishingJobs = async (
  logger: Logger,
): Promise<{ finalized: number; reset: number }> => {
  const orphans = await prisma.video.findMany({
    where: {
      status: "PUBLISHING",
      // Defensive: a row can only be PUBLISHING without publishedAt by
      // construction, but stating it keeps the intent explicit.
      publishedAt: null,
    },
    select: { id: true, youtubeVideoId: true },
  });

  if (orphans.length === 0) {
    logger.info("Startup recovery: no orphaned PUBLISHING rows.");
    return { finalized: 0, reset: 0 };
  }

  let finalized = 0;
  let reset = 0;

  for (const v of orphans) {
    if (v.youtubeVideoId) {
      await prisma.video.update({
        where: { id: v.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      finalized++;
      logger.warn(
        { videoId: v.id, youtubeVideoId: v.youtubeVideoId },
        "Orphaned PUBLISHING row finalized to PUBLISHED",
      );
      continue;
    }

    await prisma.video.update({
      where: { id: v.id },
      data: {
        status: "READY",
        failureReason: null,
      },
    });
    reset++;
    logger.warn(
      { videoId: v.id },
      "Orphaned PUBLISHING row reset to READY for retry",
    );
  }

  logger.info(
    { finalized, reset },
    "Startup recovery: reconciled orphaned PUBLISHING rows",
  );
  return { finalized, reset };
};

/**
 * Enqueue any due-now publishes. Returns the number of jobs added.
 */
export const recoverMissedScheduledJobs = async (
  queue: Queue<PublishJobData>,
  logger: Logger,
): Promise<number> => {
  const now = new Date();
  const due = await prisma.video.findMany({
    where: {
      // Only videos that haven't been published yet are eligible for
      // recovery. `publishedAt` is set only when status moves to
      // PUBLISHED, so this is a defensive belt-and-braces alongside
      // the status filter — explicit so the intent survives a future
      // schema change.
      publishedAt: null,
      status: { in: ["READY", "SCHEDULED"] },
      // Scheduled-at is null (immediate) OR in the past.
      OR: [{ scheduledPublishAt: null }, { scheduledPublishAt: { lte: now } }],
    },
    select: { id: true },
  });

  if (due.length === 0) {
    logger.info("Startup recovery: nothing to re-enqueue.");
    return 0;
  }

  logger.info({ count: due.length }, "Startup recovery: re-enqueueing due videos");

  for (const v of due) {
    await queue.add(
      "youtube-publish",
      { videoId: v.id },
      { jobId: `recovery-${v.id}` },
    );
  }

  return due.length;
};
