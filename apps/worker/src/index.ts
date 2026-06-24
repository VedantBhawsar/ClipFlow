/**
 * Worker entrypoint.
 *
 * Loads env, builds the logger, constructs the BullMQ queue + worker,
 * runs the startup-recovery scan, and wires graceful shutdown on
 * SIGTERM/SIGINT.
 */
import { loadWorkerEnv } from "./env.js";
import { buildLogger } from "./config/logger.js";
import { buildPublishQueue } from "./config/queue.js";
import { recoverMissedScheduledJobs } from "./startup-recovery.js";
import { prisma } from "@clipflow/db";

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

  const { queue, worker, connection } = buildPublishQueue(env, logger);

  const recovered = await recoverMissedScheduledJobs(queue, logger);
  logger.info({ recovered }, "Startup recovery complete");

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