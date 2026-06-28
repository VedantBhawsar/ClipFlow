/**
 * Entrypoint.
 *
 * Loads env, builds the app, starts the server, and wires graceful
 * shutdown on SIGTERM / SIGINT. This file is intentionally minimal —
 * the real wiring lives in `app.ts` and `server.ts` so each piece is
 * independently testable.
 *
 * Before `startServer()` we verify every external service is reachable
 * (Database, Cache, Queue) and print a one-line-per-service banner so
 * operators can confirm boot health at a glance. A required service
 * (anything declared in env) failing to respond exits the process
 * non-zero so orchestrators restart instead of serving traffic against
 * a half-configured runtime.
 */
import { loadApiEnv } from "./config/env.js";
import { buildLogger } from "./lib/logger.js";
import { createApp } from "./app.js";
import { startServer } from "./server.js";
import { disposeCache, getCacheBackend, verifyCache } from "./lib/cache.js";
import { closePublishQueue, verifyPublishQueue } from "./lib/queue.js";
import { prisma, setDatabaseAvailable } from "./lib/prisma.js";
import { connectEventBus, eventBus } from "./lib/events.js";
import type { Logger } from "./lib/logger.js";

/**
 * Result of a single service reachability probe. Shape stays narrow so the
 * banner formatter can stay dumb.
 */
interface ServiceCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Probe Postgres with `SELECT 1`. Returns `{ ok, detail }` for the boot
 * banner. Cheap — runs the moment the connection pool is warmed.
 */
const verifyDatabase = async (
  logger: Logger,
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
 * Format the boot-time service checks as a single block of one-line entries
 * (✓/✗) so a developer scanning the logs can confirm every dependency
 * connected. Empty array → emit nothing.
 */
const formatServiceBanner = (checks: ReadonlyArray<ServiceCheck>): string => {
  if (checks.length === 0) return "";
  return checks
    .map((c) => `${c.ok ? "✓" : "✗"} ${c.name.padEnd(20)} ${c.detail}`)
    .join("\n  ");
};

/**
 * Boot the API. Catches top-level errors with a single console.error so
 * the process exits non-zero (rather than silently hanging) if startup
 * fails — important for orchestrators and CI smoke tests.
 */
const main = async (): Promise<void> => {
  const { env, databaseAvailable } = loadApiEnv();
  const logger = buildLogger(env);

  logger.info(
    {
      env: env.NODE_ENV,
      port: env.PORT,
      webOrigin: env.WEB_ORIGIN,
      redisConfigured: Boolean(env.REDIS_URL),
    },
    "Booting ClipFlow API",
  );

  setDatabaseAvailable(databaseAvailable);

  // ---- Service reachability checks (run before listen) ----
  //
  // Anything declared in env (DB + Redis-backed Cache + Redis-backed Queue)
  // is *required* — if we can't reach it, fail loud. The in-memory cache
  // fallback is always reachable and never blocks startup.
  const checks: ServiceCheck[] = [];

  // Database (required when DATABASE_URL is real; dev stub is treated as
  // "available=false" by `setDatabaseAvailable` above so we skip the probe).
  if (databaseAvailable) {
    const db = await verifyDatabase(logger);
    checks.push({
      name: "Database (Postgres)",
      ok: db.ok,
      detail: db.ok ? `reachable in ${db.detail}` : `FAILED — ${db.detail}`,
    });
  } else {
    checks.push({
      name: "Database (Postgres)",
      ok: false,
      detail: "skipped — DATABASE_URL unset (dev stub)",
    });
  }

  // Cache (Redis when REDIS_URL is set; in-memory fallback otherwise).
  const cacheResult = await verifyCache(env);
  checks.push({
    name: `Cache (${cacheResult.backend})`,
    ok: cacheResult.ok,
    detail: cacheResult.ok
      ? `ready in ${cacheResult.latencyMs}ms`
      : `FAILED — ${cacheResult.error}`,
  });

  // Queue (BullMQ → Redis). Optional in dev (returns "not-configured"),
  // required in production — we surface a soft ✗ rather than crash so the
  // API can still serve read-only routes; enqueue jobs will 503 at runtime.
  const queueResult = await verifyPublishQueue(env);
  checks.push({
    name: "Queue (BullMQ)",
    ok: queueResult.ok,
    detail: queueResult.ok
      ? `ready in ${queueResult.latencyMs}ms`
      : queueResult.error === "not-configured"
        ? "skipped — REDIS_URL unset"
        : `FAILED — ${queueResult.error}`,
  });

  logger.info(
    { cacheBackend: getCacheBackend() },
    `Service checks:\n  ${formatServiceBanner(checks)}`,
  );

  // Hard-fail on any required-service outage.
  const required = checks.filter((c) => !c.detail.startsWith("skipped"));
  const failed = required.filter((c) => !c.ok);
  if (failed.length > 0) {
    logger.fatal(
      { failed: failed.map((f) => f.name) },
      `Required service(s) unreachable — aborting startup: ${failed
        .map((f) => f.name)
        .join(", ")}`,
    );
    process.exit(1);
  }

  // Connect the event bus (Redis pub/sub or in-memory fallback).
  await connectEventBus(env);

  const app = createApp({ env, logger });
  const running = await startServer({ app, port: env.PORT, logger });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutdown signal received; draining…");
    try {
      await running.close();
      await closePublishQueue();
      await disposeCache();
      await eventBus.dispose();
      if (databaseAvailable) {
        await prisma.$disconnect();
      }
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
  // Use stderr directly because the logger may not have been built yet
  // (env validation failure happens before logger construction).
  // eslint-disable-next-line no-console
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
