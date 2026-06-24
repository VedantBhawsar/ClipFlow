/**
 * Worker startup-recovery scan.
 *
 * On boot, look for videos that should have been published in the
 * past but are still sitting in READY/SCHEDULED status. Re-enqueue
 * them with a deterministic jobId so BullMQ dedupes if a stale job
 * is already in the queue.
 *
 * Triggered on:
 *   - First boot
 *   - Worker restart after a crash
 *   - Redis flush / queue data loss
 */
import type { Queue } from "bullmq";
import { prisma } from "@clipflow/db";
import type { Logger } from "./config/logger.js";
import type { PublishJobData } from "./jobs/youtube-publish.js";

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