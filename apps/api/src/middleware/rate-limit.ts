/**
 * Rate limiting middleware.
 *
 * Uses `express-rate-limit` to bound requests per IP per window. Two
 * tiers are configured:
 *   - Global default: 100 req / 15 min per IP (per `@clipflow/config` env).
 *   - Stricter on auth login/register: 10 req / 15 min per IP.
 *
 * Returns 429 with the `ApiErrorBody` shape so the frontend gets a
 * consistent error contract.
 */
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { Env } from "@clipflow/config";
import type { ApiErrorBody } from "@clipflow/types";

/**
 * Build the default (global) rate limiter.
 *
 * @param env Validated env (provides `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`).
 * @returns Express middleware.
 */
export const buildGlobalRateLimiter = (env: Env): RateLimitRequestHandler => {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiErrorBody = {
        error: "RATE_LIMITED",
        message: "Too many requests. Please slow down and try again shortly.",
      };
      res.status(429).json(body);
    },
  });
};

/**
 * Build the stricter auth rate limiter (used on register/login).
 *
 * @param env Validated env (shares the window with the global limiter).
 * @returns Express middleware.
 */
export const buildAuthRateLimiter = (env: Env): RateLimitRequestHandler => {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiErrorBody = {
        error: "RATE_LIMITED",
        message: "Too many sign-in attempts. Please wait a few minutes and try again.",
      };
      res.status(429).json(body);
    },
  });
};
