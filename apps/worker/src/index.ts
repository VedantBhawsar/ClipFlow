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
import { buildPublishQueue } from "./config/queue.js";
import { WorkerEventPublisher } from "./lib/events.js";
import {
  recoverMissedScheduledJobs,
  recoverOrphanedPublishingJobs,
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

  const { queue, worker } = buildPublishQueue(
    redisConnection!,
    env,
    logger,
    eventPublisher ?? undefined,
  );

  // First pass: reconcile any rows orphaned in PUBLISHING by a previous
  // worker crash. Doing this BEFORE the READY/SCHEDULED pass means a
  // crashed-mid-upload row gets reset to READY and re-enqueued in the
  // same boot instead of waiting for the next failure tick.
  const orphans = await recoverOrphanedPublishingJobs(logger);

  // Second pass: re-enqueue READY/SCHEDULED rows whose publish time has
  // come and gone.
  const recovered = await recoverMissedScheduledJobs(queue, logger);

  logger.info(
    { orphans, recovered },
    "Startup recovery complete",
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutdown signal received; draining…");
    try {
      await worker.close();
      await queue.close();
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
