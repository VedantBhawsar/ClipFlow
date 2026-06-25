/**
 * Settings route definitions.
 *
 * Mounts under `/api/settings`. Owns the lazy settings-bundle read
 * (`GET /`). The narrower writes (PATCH /profile, PATCH /preferences,
 * POST /change-password) still live in their respective modules
 * (onboarding, preferences) but are mounted under the same prefix so
 * the URL space is one tree.
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { getSettingsController } from "./settings.controller.js";
import "../auth/auth.types.js";

export const buildSettingsRouter = (env: Env): Router => {
  const router = Router();
  const auth = requireAuth(env);
  router.get("/", auth, getSettingsController);
  return router;
};