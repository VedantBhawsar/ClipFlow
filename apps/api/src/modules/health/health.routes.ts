/**
 * Health check routes.
 *
 *   GET /health      — process liveness. Always 200.
 *   GET /health/ready — DB reachability. 200 on success, 503 on failure.
 *
 * Mounted at the root (not under `/api`) because these are infrastructure
 * endpoints typically called by load balancers / uptime monitors, not by
 * the frontend.
 */
import { Router } from "express";
import { isDatabaseAvailable, prisma } from "../../lib/prisma.js";

const startedAt = Date.now();

const buildHealthPayload = () => ({
  status: "ok" as const,
  uptime: Math.round((Date.now() - startedAt) / 1000),
  timestamp: new Date().toISOString(),
});

/**
 * Build the health router.
 *
 * @returns Configured Express router.
 */
export const buildHealthRouter = (): Router => {
  const router = Router();

  router.get("/", (_req, res) => {
    res.status(200).json(buildHealthPayload());
  });

  router.get("/ready", async (_req, res) => {
    if (!isDatabaseAvailable()) {
      res.status(503).json({
        status: "unavailable",
        database: "not_configured",
        message: "DATABASE_URL is not set; DB-dependent endpoints are disabled.",
        timestamp: new Date().toISOString(),
      });
      return;
    }
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        status: "ok",
        database: "ok",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown DB error";
      res.status(503).json({
        status: "unavailable",
        database: "unreachable",
        message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
};
