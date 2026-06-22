/**
 * Onboarding route definitions.
 *
 * Mounts under `/api/onboarding`. All routes require auth.
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  patchProfileController,
  statusController,
  updateProfileController,
} from "./onboarding.controller.js";
import { patchProfileSchema, updateProfileSchema } from "./onboarding.schemas.js";
import "../auth/auth.types.js";

/**
 * Build the onboarding router bound to the validated env.
 *
 * @param env Validated env.
 * @returns Configured Express router.
 */
export const buildOnboardingRouter = (env: Env): Router => {
  const router = Router();
  const auth = requireAuth(env);

  router.get("/status", auth, statusController);
  router.post(
    "/profile",
    auth,
    validate({ body: updateProfileSchema }),
    updateProfileController,
  );
  router.patch(
    "/profile",
    auth,
    validate({ body: patchProfileSchema }),
    patchProfileController,
  );

  return router;
};
