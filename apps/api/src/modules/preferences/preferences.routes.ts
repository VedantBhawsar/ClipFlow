/**
 * Preferences route definitions.
 *
 * Mounts under `/api/user` (see `modules/user/user.routes.ts`). All
 * routes require auth. The change-password route additionally gets
 * the per-user rate limiter (5 attempts per 15-min window) so a
 * single account can't be brute-forced even across many IPs.
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { buildPerUserRateLimiter } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import {
  changePasswordController,
  getPreferencesController,
  updatePreferencesController,
} from "./preferences.controller.js";
import { changePasswordSchema, updatePreferencesSchema } from "./preferences.schemas.js";
import "../auth/auth.types.js";

/**
 * Build the preferences router bound to the validated env.
 *
 * @param env Validated env.
 * @returns Configured Express router.
 */
export const buildPreferencesRouter = (env: Env): Router => {
  const router = Router();
  const auth = requireAuth(env);
  // 5 password-change attempts per 15-min window per user. Generous
  // enough for a real user who fat-fingers their current password a
  // couple of times, tight enough to make brute force impractical.
  const changePasswordLimiter = buildPerUserRateLimiter(env, {
    max: 5,
    resource: "password changes",
  });

  router.get("/preferences", auth, getPreferencesController);
  router.patch(
    "/preferences",
    auth,
    validate({ body: updatePreferencesSchema }),
    updatePreferencesController,
  );
  router.post(
    "/change-password",
    auth,
    changePasswordLimiter,
    validate({ body: changePasswordSchema }),
    changePasswordController,
  );

  return router;
};
