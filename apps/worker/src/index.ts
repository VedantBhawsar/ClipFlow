/**
 * Worker entrypoint.
 *
 * Loads env, builds the logger, constructs the BullMQ queue + worker,
 * runs the startup-recovery scan, and wires graceful shutdown on
 * SIGTERM / SIGINT.
 *
 * Like the API, the worker probes every external dependency at boot
 * (Postgres + Redis-backed BullMQ) and prints a one-line-per-service
 * banner so an operator can confirm health at a glance. Required-service
 * outages exit the process non-zero.
 */
import { Redis } from "ioredis";
import { loadWorkerEnv } from "./env.js";
import { buildLogger } from "./config/logger.js";
import { buildPublishQueue } from "./config/queue.js";
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
 * Probe Postgres with `SELECT 1` for the boot banner.
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

/**
 * Probe the worker-side Redis connection. We open a fresh connection here
 * rather than reusing the BullMQ one — the worker constructs the queue
 * first so the connection is in `connect()` state by the time we check.
 */
const verifyRedis = async (
  redisUrl: string,
  logger: ReturnType<typeof buildLogger>,
): Promise<{ ok: boolean; detail: string }> => {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  probe.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[worker:probe] redis error:", err.message);
  });
  try {
    const start = Date.now();
    await probe.connect();
    const pong = await probe.ping();
    if (pong !== "PONG") {
      return { ok: false, detail: `PING returned ${pong}` };
    }
    return { ok: true, detail: `${Date.now() - start}ms` };
  } catch (err) {
    logger.error({ err }, "Redis probe failed");
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await probe.quit().catch(() => probe.disconnect());
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

  // loadWorkerEnv() throws if REDIS_URL is unset, so the ?? branch is
  // unreachable at runtime — but TS doesn't narrow the type, so we guard
  // explicitly and emit a "skipped" line instead of attempting an empty URL.
  const redis = env.REDIS_URL
    ? await verifyRedis(env.REDIS_URL, logger)
    : { ok: false as const, detail: "REDIS_URL not configured" };
  checks.push({
    name: "Redis (BullMQ)",
    ok: redis.ok,
    detail: redis.ok ? `reachable in ${redis.detail}` : `FAILED — ${redis.detail}`,
  });

  logger.info(`Service checks:\n  ${formatServiceBanner(checks)}`);

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    logger.fatal(
      { failed: failed.map((f) => f.name) },
      `Required service(s) unreachable — aborting startup: ${failed
        .map((f) => f.name)
        .join(", ")}`,
    );
    process.exit(1);
  }

  const { queue, worker, connection } = buildPublishQueue(env, logger);

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
      connection.disconnect();
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
