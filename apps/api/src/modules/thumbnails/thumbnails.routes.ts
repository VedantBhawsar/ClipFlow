import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  listThumbnailsController,
  selectThumbnailController,
  regenerateThumbnailsController,
  getThumbnailStyleController,
  updateThumbnailStyleController,
  triggerStyleAnalysisController,
} from "./thumbnails.controller.js";
import {
  regenerateThumbnailsBodySchema,
  thumbnailIdParamsSchema,
  triggerStyleAnalysisBodySchema,
  updateThumbnailStyleBodySchema,
  videoIdParamsSchema,
} from "./thumbnails.schemas.js";

export const buildThumbnailsRouter = (env: Env): Router => {
  const router = Router();
  const auth = requireAuth(env);

  // Video-scoped thumbnail operations: /api/videos/:id/thumbnails/*
  // These are mounted directly on the videos router in app.ts

  router.get(
    "/:id/thumbnails",
    auth,
    validate({ params: videoIdParamsSchema }),
    listThumbnailsController,
  );

  router.post(
    "/:id/thumbnails/regenerate",
    auth,
    validate({ params: videoIdParamsSchema, body: regenerateThumbnailsBodySchema }),
    regenerateThumbnailsController,
  );

  router.post(
    "/:id/thumbnails/:thumbnailId/select",
    auth,
    validate({ params: thumbnailIdParamsSchema }),
    selectThumbnailController,
  );

  return router;
};

/**
 * Router for user-level thumbnail style operations: /api/thumbnail-style
 */
export const buildThumbnailStyleRouter = (env: Env): Router => {
  const router = Router();
  const auth = requireAuth(env);

  router.get("/", auth, getThumbnailStyleController);

  router.patch(
    "/",
    auth,
    validate({ body: updateThumbnailStyleBodySchema }),
    updateThumbnailStyleController,
  );

  router.post(
    "/analyze",
    auth,
    validate({ body: triggerStyleAnalysisBodySchema }),
    triggerStyleAnalysisController,
  );

  return router;
};
