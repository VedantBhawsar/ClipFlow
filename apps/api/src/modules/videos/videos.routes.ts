/**
 * Videos route definitions.
 *
 * Mounts under `/api/videos`. All routes require auth. The create +
 * finalize routes are per-user rate limited to bound upload-spam.
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { buildPerUserRateLimiter } from "../../middleware/rate-limit.js";
import {
  createVideoController,
  deleteVideoController,
  finalizeVideoController,
  getUploadUrlController,
  getVideoController,
  listVideosController,
} from "./videos.controller.js";
import {
  createVideoSchema,
  videoIdParamsSchema,
} from "./videos.schemas.js";
import "../auth/auth.types.js";

/**
 * Build the videos router.
 */
export const buildVideosRouter = (env: Env): Router => {
  const router = Router();
  const auth = requireAuth(env);

  // Per-user limiter for upload-spam-sensitive paths.
  const createLimiter = buildPerUserRateLimiter(env, {
    max: 30,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    resource: "video uploads",
  });
  const finalizeLimiter = buildPerUserRateLimiter(env, {
    max: 30,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    resource: "upload finalizations",
  });

  router.post("/", auth, createLimiter, validate({ body: createVideoSchema }), createVideoController);

  router.post(
    "/:id/upload-url",
    auth,
    finalizeLimiter,
    validate({ params: videoIdParamsSchema }),
    getUploadUrlController,
  );

  router.post(
    "/:id/finalize",
    auth,
    finalizeLimiter,
    validate({ params: videoIdParamsSchema }),
    finalizeVideoController,
  );

  router.get("/", auth, listVideosController);

  router.get(
    "/:id",
    auth,
    validate({ params: videoIdParamsSchema }),
    getVideoController,
  );

  router.delete(
    "/:id",
    auth,
    validate({ params: videoIdParamsSchema }),
    deleteVideoController,
  );

  return router;
};