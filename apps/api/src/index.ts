/**
 * Entrypoint.
 *
 * Loads env, builds the app, starts the server, and wires graceful
 * shutdown on SIGTERM / SIGINT. This file is intentionally minimal —
 * the real wiring lives in `app.ts` and `server.ts` so each piece is
 * independently testable.
 */
import { loadApiEnv } from "./config/env.js";
import { buildLogger } from "./lib/logger.js";
import { createApp } from "./app.js";
import { startServer } from "./server.js";
import { disposeCache } from "./lib/cache.js";
import { closePublishQueue } from "./lib/queue.js";
import { prisma, setDatabaseAvailable } from "./lib/prisma.js";

/**
 * Boot the API. Catches top-level errors with a single console.error so
 * the process exits non-zero (rather than silently hanging) if startup
 * fails — important for orchestrators and CI smoke tests.
 */
const main = async (): Promise<void> => {
  const { env, databaseAvailable } = loadApiEnv();
  const logger = buildLogger(env);

  logger.info(
    { env: env.NODE_ENV, port: env.PORT, webOrigin: env.WEB_ORIGIN, databaseAvailable },
    "Booting ClipFlow API",
  );

  setDatabaseAvailable(databaseAvailable);

  const app = createApp({ env, logger });
  const running = await startServer({ app, port: env.PORT, logger });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutdown signal received; draining…");
    try {
      await running.close();
      disposeCache();
      await closePublishQueue();
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
