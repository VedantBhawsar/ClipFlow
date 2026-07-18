/**
 * Worker entrypoint.
 *
 * Loads env, builds the logger, constructs the BullMQ queue + worker,
 * runs the startup-recovery scan, and wires graceful shutdown on
 * SIGTERM / SIGINT.
 *
 * Every external dependency (Postgres, Redis) is probed at boot using
 * the actual connections that will serve traffic — no throwaway probes.
 * Any required-service outage exits non-zero before recovery or job
 * processing begins.
 */
import { Redis } from "ioredis";
import { loadWorkerEnv } from "./env.js";
import { buildLogger } from "./config/logger.js";
import {
  buildChannelStyleQueue,
  buildGenerateQueue,
  buildPublishQueue,
  buildThumbnailsQueue,
  buildTranscriptionQueue,
  buildVideoIngestQueue,
} from "./config/queue.js";
import { WorkerEventPublisher } from "./lib/events.js";
import {
  recoverMissedScheduledJobs,
  recoverOrphanedGenerateJobs,
  recoverOrphanedIngestJobs,
  recoverOrphanedPublishingJobs,
  recoverOrphanedThumbnailsJobs,
  recoverOrphanedTranscriptionJobs,
} from "./startup-recovery.js";
import { prisma } from "@clipflow/db";

interface ServiceCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Probe Postgres with `SELECT 1`.
 */
const verifyDatabase = async (
  logger: ReturnType<typeof buildLogger>,
): Promise<{ ok: boolean; detail: string }> => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, detail: `${Date.now() - start}ms` };
  } catch (err) {
    logger.error({ err }, "Database probe failed");
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
};

const formatServiceBanner = (checks: ReadonlyArray<ServiceCheck>): string =>
  checks
    .map((c) => `${c.ok ? "✓" : "✗"} ${c.name.padEnd(20)} ${c.detail}`)
    .join("\n  ");

const main = async (): Promise<void> => {
  const env = loadWorkerEnv();
  const logger = buildLogger();

  logger.info(
    {
      env: env.NODE_ENV,
      redis: env.REDIS_URL,
      bucket: env.S3_BUCKET,
      s3Endpoint: env.S3_ENDPOINT,
    },
    "Booting ClipFlow worker",
  );

  // ---- Service reachability checks (run before recovery scan) ----
  const checks: ServiceCheck[] = [];

  const db = await verifyDatabase(logger);
  checks.push({
    name: "Database (Postgres)",
    ok: db.ok,
    detail: db.ok ? `reachable in ${db.detail}` : `FAILED — ${db.detail}`,
  });

  // Redis connection for BullMQ — create and PING the actual connection,
  // then pass it to the queue builder (no throwaway probe).
  let redisConnection: Redis | null = null;
  if (env.REDIS_URL) {
    const start = Date.now();
    try {
      redisConnection = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
      });
      await redisConnection.ping();
      checks.push({
        name: "Redis (BullMQ)",
        ok: true,
        detail: `reachable in ${Date.now() - start}ms`,
      });
    } catch (err) {
      checks.push({
        name: "Redis (BullMQ)",
        ok: false,
        detail: `FAILED — ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    checks.push({
      name: "Redis (BullMQ)",
      ok: false,
      detail: "FAILED — REDIS_URL not configured",
    });
  }

  // Event publisher connection — separate from BullMQ so pub/sub
  // failures never interfere with job processing.
  let eventPublisher: WorkerEventPublisher | null = null;
  if (env.REDIS_URL) {
    const start = Date.now();
    try {
      const publisher = new WorkerEventPublisher(env.REDIS_URL);
      await publisher.connect();
      eventPublisher = publisher;
      checks.push({
        name: "Redis (Events)",
        ok: true,
        detail: `reachable in ${Date.now() - start}ms`,
      });
    } catch (err) {
      checks.push({
        name: "Redis (Events)",
        ok: false,
        detail: `FAILED — ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    checks.push({
      name: "Redis (Events)",
      ok: false,
      detail: "FAILED — REDIS_URL not configured",
    });
  }

  logger.info(`Service checks:\n  ${formatServiceBanner(checks)}`);

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    logger.fatal(
      { failed: failed.map((f) => f.name) },
      `Required service(s) unreachable — aborting startup: ${failed
        .map((f) => f.name)
        .join(", ")}`,
    );
    if (redisConnection) {
      await redisConnection.quit().catch(() => redisConnection!.disconnect());
    }
    if (eventPublisher) {
      await eventPublisher.dispose();
    }
    process.exit(1);
  }

  // Build all six queues — they share the same Redis connection.
  //
  // Order matters:
  //   - thumbnails queue is built BEFORE generate so we can hand
  //     the generate worker a closure that enqueues into the
  //     thumbnails queue (generate's tail enqueues the thumbnails
  //     job after persisting chapters).
  //   - generate queue is built BEFORE transcription for the same
  //     reason (transcription's tail enqueues generate).
  //   - transcription queue is built BEFORE ingest for the same
  //     reason (ingest's tail enqueues transcription).
  const { queue: publishQueue, worker: publishWorker } = buildPublishQueue(
    redisConnection!,
    env,
    logger,
    eventPublisher ?? undefined,
  );
  const { queue: thumbnailsQueue, worker: thumbnailsWorker } = buildThumbnailsQueue(
    redisConnection!,
    env,
    logger,
    eventPublisher ?? undefined,
  );
  const enqueueThumbnails = async (videoId: string): Promise<void> => {
    await thumbnailsQueue.add(
      "thumbnails",
      { videoId },
      { jobId: `thumbnails-${videoId}` },
    );
  };
  const { queue: generateQueue, worker: generateWorker } = buildGenerateQueue(
    redisConnection!,
    env,
    logger,
    eventPublisher ?? undefined,
    enqueueThumbnails,
  );
  const enqueueGenerate = async (videoId: string): Promise<void> => {
    await generateQueue.add(
      "generate",
      { videoId },
      { jobId: `generate-${videoId}` },
    );
  };
  const { queue: transcriptionQueue, worker: transcriptionWorker } =
    buildTranscriptionQueue(
      redisConnection!,
      env,
      logger,
      eventPublisher ?? undefined,
      enqueueGenerate,
    );
  const enqueueTranscription = async (videoId: string): Promise<void> => {
    await transcriptionQueue.add(
      "transcription",
      { videoId },
      { jobId: `transcribe-${videoId}` },
    );
  };
  const { queue: ingestQueue, worker: ingestWorker } = buildVideoIngestQueue(
    redisConnection!,
    env,
    logger,
    eventPublisher ?? undefined,
    enqueueTranscription,
  );

  // Channel style analysis queue — used by the YouTube connect flow
  // (enqueue after OAuth callback succeeds) and by the settings page
  // (manual "re-analyze" trigger).
  const { queue: channelStyleQueue, worker: channelStyleWorker } = buildChannelStyleQueue(
    redisConnection!,
    env,
    logger,
    eventPublisher ?? undefined,
  );
  const enqueueChannelStyleAnalysis = async (userId: string): Promise<void> => {
    await channelStyleQueue.add(
      "channel-style-analyze",
      { userId },
      { jobId: `channel-style-${userId}` },
    );
  };

  // Pass 1: reconcile any rows orphaned in PUBLISHING by a previous
  // worker crash. Doing this BEFORE the ingest pass means a
  // crashed-mid-upload row gets reset to READY and re-enqueued in the
  // same boot instead of waiting for the next failure tick.
  const orphans = await recoverOrphanedPublishingJobs(logger);

  // Pass 2: reconcile any rows orphaned in EXTRACTING. If s3KeyAudio
  // is set the worker finished but the DB write was lost — advance to
  // TRANSCRIBING. Otherwise reset to UPLOADED and re-enqueue.
  const ingestOrphans = await recoverOrphanedIngestJobs(ingestQueue, logger);

  // Pass 3: reconcile any rows orphaned in TRANSCRIBING. If
  // transcriptS3Key is set the transcription finished but the DB
  // write to GENERATING was lost — advance. Otherwise re-enqueue the
  // transcription job (the job itself checks for audio presence and
  // fails permanent if missing).
  const transcriptionOrphans = await recoverOrphanedTranscriptionJobs(
    transcriptionQueue,
    logger,
  );

  // Pass 4: reconcile any rows orphaned in GENERATING before
  // `chaptersJson` was written. These are videos where the LLM call
  // never completed — re-enqueue the generate job. This pass
  // deliberately does NOT finalize rows where chaptersJson is set;
  // the next pass owns that case so thumbnails don't get skipped.
  const generateOrphans = await recoverOrphanedGenerateJobs(
    generateQueue,
    logger,
  );

  // Pass 5: reconcile any rows orphaned in GENERATING after
  // `chaptersJson` was written but before the final READY_FOR_REVIEW
  // flip. If a completed ThumbnailGeneration exists, finalize;
  // otherwise re-enqueue the thumbnails job onto the thumbnails
  // queue. This is the pass that makes sure thumbnails actually
  // get generated when the worker dies mid-pipeline.
  const thumbnailsOrphans = await recoverOrphanedThumbnailsJobs(
    thumbnailsQueue,
    logger,
  );

  // Pass 6: re-enqueue READY/SCHEDULED rows whose publish time has
  // come and gone.
  const recovered = await recoverMissedScheduledJobs(publishQueue, logger);

  logger.info(
    {
      orphans,
      ingestOrphans,
      transcriptionOrphans,
      generateOrphans,
      thumbnailsOrphans,
      recovered,
    },
    "Startup recovery complete",
  );

    const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutdown signal received; draining…");
    try {
      await publishWorker.close();
      await ingestWorker.close();
      await transcriptionWorker.close();
      await generateWorker.close();
      await thumbnailsWorker.close();
      await channelStyleWorker.close();
      await publishQueue.close();
      await ingestQueue.close();
      await transcriptionQueue.close();
      await generateQueue.close();
      await thumbnailsQueue.close();
      await channelStyleQueue.close();
      redisConnection!.disconnect();
      await eventPublisher?.dispose();
      await prisma.$disconnect();
      logger.info("Shutdown complete.");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
  });
};

main().catch((err: unknown) => {
  console.error("Fatal error during worker startup:", err);
  process.exit(1);
});
