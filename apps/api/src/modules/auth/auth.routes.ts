/**
 * Auth route definitions.
 *
 * Mounts under `/api/auth`. Each route is wired with the right
 * middlewares in order: stricter rate limit (login/register/refresh only)
 * → validation → controller.
 *
 * Note: `/refresh` and `/logout` are NOT behind `requireAuth` — the
 * refresh token IS the credential, and logout should work even when the
 * access token is gone (otherwise a user whose access token just expired
 * couldn't log out).
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { validate } from "../../middleware/validate.js";
import { buildAuthRateLimiter } from "../../middleware/rate-limit.js";
import {
  googleController,
  loginController,
  logoutController,
  refreshController,
  registerController,
} from "./auth.controller.js";
import {
  googleAuthSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "./auth.schemas.js";
import "./auth.types.js";

export const buildAuthRouter = (env: Env): Router => {
  const router = Router();
  const authLimiter = buildAuthRateLimiter(env);

  router.post(
    "/register",
    authLimiter,
    validate({ body: registerSchema }),
    registerController(env),
  );
  router.post(
    "/login",
    authLimiter,
    validate({ body: loginSchema }),
    loginController(env),
  );
  // Refresh is rate-limited like login/register — prevents brute-force
  // attacks against the refresh-token hash space.
  router.post(
    "/refresh",
    authLimiter,
    validate({ body: refreshSchema }),
    refreshController(env),
  );
  // Logout is intentionally NOT rate-limited (it's idempotent and
  // authenticated via the refresh token in the body).
  router.post("/logout", validate({ body: logoutSchema }), logoutController);
  router.post("/google", validate({ body: googleAuthSchema }), googleController);

  return router;
};