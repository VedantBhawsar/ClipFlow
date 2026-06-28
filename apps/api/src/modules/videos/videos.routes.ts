/**
 * Videos route definitions.
 *
 * The route table is split by upload state so a malformed id can't
 * reach the wrong handler:
 *
 *   POST   /api/videos                         → in-flight: create pending
 *   POST   /api/videos/pending/:id/upload-url  → in-flight: refresh URL
 *   POST   /api/videos/pending/:id/finalize    → in-flight: commit
 *   DELETE /api/videos/pending/:id             → in-flight: cancel
 *   GET    /api/videos                         → committed: list (?status=…)
 *   GET    /api/videos/published               → committed: list PUBLISHED
 *   GET    /api/videos/stream                  → SSE: user's video events
 *   GET    /api/videos/:id/stream              → SSE: single video events
 *   GET    /api/videos/:id                     → committed: read
 *   DELETE /api/videos/:id                     → committed: cancel
 *   POST   /api/videos/:id/unpublish           → committed: unpublish
 *
 * The pending/committed split is enforced by separate zod schemas
 * (see `./videos.schemas.ts`) so a request to `/api/videos/vid_xxx/finalize`
 * fails at the edge with 400 instead of reaching the service.
 *
 * All routes require auth. The create + finalize routes are per-user
 * rate limited to bound upload-spam.
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { requireSseAuth } from "../../middleware/sse-auth.js";
import { validate } from "../../middleware/validate.js";
import { buildPerUserRateLimiter } from "../../middleware/rate-limit.js";
import {
  cancelPendingUploadController,
  createVideoController,
  deleteVideoController,
  finalizeVideoController,
  getUploadUrlController,
  getVideoController,
  listPublishedVideosController,
  listVideosController,
  streamUserVideosController,
  streamVideoController,
  unpublishVideoController,
} from "./videos.controller.js";
import {
  createVideoSchema,
  listPublishedVideosQuerySchema,
  listVideosQuerySchema,
  pendingUploadIdParamsSchema,
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
  // cancel is cheap; we still rate-limit it to bound the worst case of a
  // runaway client retry loop.
  const cancelLimiter = buildPerUserRateLimiter(env, {
    max: 60,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    resource: "upload cancellations",
  });

  router.post("/", auth, createLimiter, validate({ body: createVideoSchema }), createVideoController);

  router.post(
    "/pending/:id/upload-url",
    auth,
    finalizeLimiter,
    validate({ params: pendingUploadIdParamsSchema }),
    getUploadUrlController,
  );

  router.post(
    "/pending/:id/finalize",
    auth,
    finalizeLimiter,
    validate({ params: pendingUploadIdParamsSchema }),
    finalizeVideoController,
  );

  router.delete(
    "/pending/:id",
    auth,
    cancelLimiter,
    validate({ params: pendingUploadIdParamsSchema }),
    cancelPendingUploadController,
  );

  router.get(
    "/",
    auth,
    validate({ query: listVideosQuerySchema }),
    listVideosController,
  );

  // Mounted BEFORE the `/:id` route so `/published` and `/stream`
  // aren't matched as an id parameter (Express matches in declaration order).
  router.get(
    "/published",
    auth,
    validate({ query: listPublishedVideosQuerySchema }),
    listPublishedVideosController,
  );

  router.get("/stream", requireSseAuth(env), streamUserVideosController);

  router.get(
    "/:id/stream",
    requireSseAuth(env),
    validate({ params: videoIdParamsSchema }),
    streamVideoController,
  );

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

  router.post(
    "/:id/unpublish",
    auth,
    validate({ params: videoIdParamsSchema }),
    unpublishVideoController,
  );

  return router;
};
