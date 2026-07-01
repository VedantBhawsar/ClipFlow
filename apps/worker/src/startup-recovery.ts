/**
 * Worker startup-recovery scan.
 *
 * Five passes, run in order:
 *
 *   1. `recoverOrphanedPublishingJobs` — videos left in `PUBLISHING`
 *      when a previous worker process died. If a YouTube video id is
 *      already set on the row, the upload most likely completed on
 *      YouTube's side and only the DB flip failed — finalize them to
 *      PUBLISHED. Otherwise reset them to READY so the standard
 *      recovery (and BullMQ's retry policy) can take another swing.
 *
 *   2. `recoverOrphanedIngestJobs` — videos left in `EXTRACTING`
 *      when a previous worker died mid-extraction. If `s3KeyAudio` is
 *      set, the FFmpeg run finished and only the DB write failed —
 *      advance the row to TRANSCRIBING. Otherwise reset to UPLOADED
 *      and re-enqueue the ingest job with a deterministic jobId.
 *
 *   3. `recoverOrphanedTranscriptionJobs` — videos left in
 *      `TRANSCRIBING` when a previous worker died. If `transcriptS3Key`
 *      is set, transcription finished and only the GENERATING write
 *      was lost — advance. Otherwise re-enqueue the transcription job
 *      (which will fail permanent via `[AAI_AUDIO_MISSING]` if audio
 *      is genuinely absent — startup-recovery only re-enqueues, never
 *      resets to UPLOADED, because the audio might still be present).
 *
 *   4. `recoverOrphanedGenerateJobs` — videos left in `GENERATING`
 *      when a previous worker died. If `chaptersJson` is set, the
 *      generate run finished and only the READY_FOR_REVIEW write was
 *      lost — advance. Otherwise re-enqueue the generate job (which
 *      will fail permanent via `[GEN_TRANSCRIPT_MISSING]` if the
 *      transcript is genuinely gone — same "re-enqueue, never reset"
 *      stance as the transcription pass).
 *
 *   5. `recoverMissedScheduledJobs` — READY/SCHEDULED rows whose
 *      publish time has come and gone, never enqueued or lost when
 *      Redis was flushed. Re-enqueue with a deterministic jobId so
 *      BullMQ dedupes if a stale job is already in the queue.
 *
 * All five passes run on every boot — first boot, worker restart after
 * a crash, and Redis flush / queue data loss.
 */
import type { Queue } from "bullmq";
import { prisma } from "@clipflow/db";
import type { Logger } from "./config/logger.js";
import type { PublishJobData } from "./jobs/youtube-publish.js";
import type { TranscriptionJobData } from "./jobs/transcription.js";
import type { GenerateJobData } from "./jobs/generate.js";

export interface StartupRecoveryReport {
  /** Videos that were PUBLISHING and finalized to PUBLISHED. */
  finalized: number;
  /** Videos that were PUBLISHING and reset to READY for a fresh attempt. */
  reset: number;
  /** Videos that were EXTRACTING and finalized to TRANSCRIBING. */
  ingestFinalized: number;
  /** Videos that were EXTRACTING and reset to UPLOADED for re-ingest. */
  ingestReset: number;
  /** Videos that were TRANSCRIBING and finalized to GENERATING. */
  transcriptionFinalized: number;
  /** Videos that were TRANSCRIBING and re-enqueued for another attempt. */
  transcriptionReset: number;
  /** Videos that were GENERATING and finalized to READY_FOR_REVIEW. */
  generateFinalized: number;
  /** Videos that were GENERATING and re-enqueued for another attempt. */
  generateReset: number;
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
): Promise<Pick<StartupRecoveryReport, "finalized" | "reset">> => {
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
 * Reconcile rows orphaned in `EXTRACTING` by a crashed worker.
 *
 * Two outcomes:
 *   - `s3KeyAudio` is set → FFmpeg finished and uploaded the audio;
 *     only the DB write to TRANSCRIBING didn't land. Finalize to TRANSCRIBING.
 *   - `s3KeyAudio` is null → FFmpeg never completed. Reset to UPLOADED
 *     and re-enqueue with a deterministic jobId so BullMQ deduplicates
 *     against any stale job already in the queue.
 *
 * Returns `{ finalized, reset }` so the caller can log both buckets.
 */
export const recoverOrphanedIngestJobs = async (
  queue: Queue<{ videoId: string }>,
  logger: Logger,
): Promise<Pick<StartupRecoveryReport, "ingestFinalized" | "ingestReset">> => {
  const orphans = await prisma.video.findMany({
    where: { status: "EXTRACTING" },
    select: { id: true, s3KeyAudio: true },
  });

  if (orphans.length === 0) {
    logger.info("Startup recovery: no orphaned EXTRACTING rows.");
    return { ingestFinalized: 0, ingestReset: 0 };
  }

  let ingestFinalized = 0;
  let ingestReset = 0;

  for (const v of orphans) {
    if (v.s3KeyAudio) {
      // Extraction completed but the TRANSCRIBING update was lost.
      await prisma.video.update({
        where: { id: v.id },
        data: { status: "TRANSCRIBING", failureReason: null },
      });
      ingestFinalized++;
      logger.warn(
        { videoId: v.id },
        "Orphaned EXTRACTING row finalized to TRANSCRIBING",
      );
    } else {
      // Extraction didn't complete — reset and let BullMQ retry.
      await prisma.video.update({
        where: { id: v.id },
        data: { status: "UPLOADED", failureReason: null },
      });
      await queue.add(
        "video-ingest",
        { videoId: v.id },
        { jobId: `recovery-ingest-${v.id}` },
      );
      ingestReset++;
      logger.warn(
        { videoId: v.id },
        "Orphaned EXTRACTING row reset to UPLOADED and re-enqueued",
      );
    }
  }

  logger.info(
    { ingestFinalized, ingestReset },
    "Startup recovery: reconciled orphaned EXTRACTING rows",
  );
  return { ingestFinalized, ingestReset };
};

/**
 * Reconcile rows orphaned in `TRANSCRIBING` by a crashed worker.
 *
 * Two outcomes:
 *   - `transcriptS3Key` is set → transcription finished and uploaded
 *     the JSON; only the DB write to GENERATING didn't land. Finalize
 *     to GENERATING.
 *   - `transcriptS3Key` is null → transcription didn't complete.
 *     Re-enqueue the transcription job with a deterministic jobId so
 *     BullMQ deduplicates against any stale job already in the queue.
 *     The job itself checks for audio presence and fails permanent
 *     with `[AAI_AUDIO_MISSING]` if the audio is genuinely gone —
 *     startup-recovery deliberately does NOT reset to UPLOADED,
 *     because doing so would re-trigger an expensive FFmpeg run
 *     when the audio is actually present and only the transcript is
 *     missing.
 *
 * Returns `{ transcriptionFinalized, transcriptionReset }` so the
 * caller can log both buckets.
 */
export const recoverOrphanedTranscriptionJobs = async (
  queue: Queue<TranscriptionJobData>,
  logger: Logger,
): Promise<
  Pick<StartupRecoveryReport, "transcriptionFinalized" | "transcriptionReset">
> => {
  const orphans = await prisma.video.findMany({
    where: { status: "TRANSCRIBING" },
    select: { id: true, transcriptS3Key: true },
  });

  if (orphans.length === 0) {
    logger.info("Startup recovery: no orphaned TRANSCRIBING rows.");
    return { transcriptionFinalized: 0, transcriptionReset: 0 };
  }

  let transcriptionFinalized = 0;
  let transcriptionReset = 0;

  for (const v of orphans) {
    if (v.transcriptS3Key) {
      // Transcription completed but the GENERATING update was lost.
      await prisma.video.update({
        where: { id: v.id },
        data: { status: "GENERATING", failureReason: null },
      });
      transcriptionFinalized++;
      logger.warn(
        { videoId: v.id },
        "Orphaned TRANSCRIBING row finalized to GENERATING",
      );
      continue;
    }

    // Re-enqueue with a recovery-prefixed jobId so the worker can
    // tell crash-recovery enqueues apart from the standard enqueue
    // path in any future log analysis. BullMQ dedupes against any
    // stale job that's still in the queue from the previous worker.
    await queue.add(
      "transcription",
      { videoId: v.id },
      { jobId: `recovery-transcribe-${v.id}` },
    );
    transcriptionReset++;
    logger.warn(
      { videoId: v.id },
      "Orphaned TRANSCRIBING row re-enqueued for transcription retry",
    );
  }

  logger.info(
    { transcriptionFinalized, transcriptionReset },
    "Startup recovery: reconciled orphaned TRANSCRIBING rows",
  );
  return { transcriptionFinalized, transcriptionReset };
};

/**
 * Reconcile rows orphaned in `GENERATING` by a crashed worker.
 *
 * Two outcomes:
 *   - `chaptersJson` is set → the generate run finished and only the
 *     READY_FOR_REVIEW write didn't land. Finalize to READY_FOR_REVIEW.
 *   - `chaptersJson` is null → the LLM call never completed. Re-enqueue
 *     the generate job with a deterministic jobId so BullMQ
 *     deduplicates against any stale job already in the queue. The
 *     job itself checks for transcript presence and fails permanent
 *     with `[GEN_TRANSCRIPT_MISSING]` if the transcript is genuinely
 *     gone — startup-recovery deliberately does NOT reset to
 *     TRANSCRIBING, because doing so would re-trigger an expensive
 *     AssemblyAI run when the transcript is actually present and
 *     only the LLM output is missing.
 *
 * Returns `{ generateFinalized, generateReset }` so the caller can
 * log both buckets.
 */
export const recoverOrphanedGenerateJobs = async (
  queue: Queue<GenerateJobData>,
  logger: Logger,
): Promise<Pick<StartupRecoveryReport, "generateFinalized" | "generateReset">> => {
  const orphans = await prisma.video.findMany({
    where: { status: "GENERATING" },
    select: { id: true, chaptersJson: true },
  });

  if (orphans.length === 0) {
    logger.info("Startup recovery: no orphaned GENERATING rows.");
    return { generateFinalized: 0, generateReset: 0 };
  }

  let generateFinalized = 0;
  let generateReset = 0;

  for (const v of orphans) {
    if (v.chaptersJson !== null && v.chaptersJson !== undefined) {
      // Generation completed but the READY_FOR_REVIEW update was lost.
      await prisma.video.update({
        where: { id: v.id },
        data: { status: "READY_FOR_REVIEW", failureReason: null },
      });
      generateFinalized++;
      logger.warn(
        { videoId: v.id },
        "Orphaned GENERATING row finalized to READY_FOR_REVIEW",
      );
      continue;
    }

    // Re-enqueue with a recovery-prefixed jobId so the worker can
    // tell crash-recovery enqueues apart from the standard enqueue
    // path in any future log analysis. BullMQ dedupes against any
    // stale job that's still in the queue from the previous worker.
    await queue.add(
      "generate",
      { videoId: v.id },
      { jobId: `recovery-generate-${v.id}` },
    );
    generateReset++;
    logger.warn(
      { videoId: v.id },
      "Orphaned GENERATING row re-enqueued for generation retry",
    );
  }

  logger.info(
    { generateFinalized, generateReset },
    "Startup recovery: reconciled orphaned GENERATING rows",
  );
  return { generateFinalized, generateReset };
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
