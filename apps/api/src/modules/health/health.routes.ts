/**
 * Health check routes.
 *
 *   GET /health      — process liveness. Always 200.
 *   GET /health/ready — DB reachability. 200 on success, 503 on failure.
 *
 * Mounted at the root (not under `/api`) because these are infrastructure
 * endpoints typically called by load balancers / uptime monitors, not by
 * the frontend.
 *
 * Responses are emitted in the centralized envelope shape so every call
 * site (load balancer probe, uptime monitor, frontend, ad-hoc curl)
 * parses the same JSON contract.
 */
import { Router } from "express";
import { isDatabaseAvailable, prisma } from "../../lib/prisma.js";
import { sendOk } from "../../lib/response.js";

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
    sendOk(res, buildHealthPayload(), "Service is healthy.");
  });

  router.get("/ready", async (_req, res) => {
    if (!isDatabaseAvailable()) {
      sendOk(
        res,
        {
          status: "unavailable" as const,
          database: "not_configured",
          message: "DATABASE_URL is not set; DB-dependent endpoints are disabled.",
          timestamp: new Date().toISOString(),
        },
        "Database not configured.",
        503,
      );
      return;
    }
    try {
      await prisma.$queryRaw`SELECT 1`;
      sendOk(
        res,
        {
          status: "ok" as const,
          database: "ok" as const,
          timestamp: new Date().toISOString(),
        },
        "Service is ready.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown DB error";
      sendOk(
        res,
        {
          status: "unavailable" as const,
          database: "unreachable" as const,
          message,
          timestamp: new Date().toISOString(),
        },
        "Database unreachable.",
        503,
      );
    }
  });

  return router;
};