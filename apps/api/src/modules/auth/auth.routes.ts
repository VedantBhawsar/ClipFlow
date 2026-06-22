/**
 * Auth route definitions.
 *
 * Mounts under `/api/auth`. Each route is wired with the right
 * middlewares in order: stricter rate limit (login/register only) →
 * validation → controller.
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { buildAuthRateLimiter } from "../../middleware/rate-limit.js";
import {
  googleController,
  loginController,
  logoutController,
  meController,
  registerController,
} from "./auth.controller.js";
import { googleAuthSchema, loginSchema, registerSchema } from "./auth.schemas.js";
import "./auth.types.js";

/**
 * Build the auth router bound to the validated env.
 *
 * @param env Validated env.
 * @returns Configured Express router.
 */
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
  router.post("/logout", requireAuth(env), logoutController);
  router.get("/me", requireAuth(env), meController);
  router.post("/google", validate({ body: googleAuthSchema }), googleController);

  return router;
};
