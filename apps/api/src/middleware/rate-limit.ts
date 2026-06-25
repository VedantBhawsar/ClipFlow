/**
 * Rate limiting middleware.
 *
 * Uses `express-rate-limit` to bound requests per IP per window. Three
 * tiers are configured:
 *   - Global default: 100 req / 15 min per IP (per `@clipflow/config` env).
 *   - Stricter on auth login/register: 10 req / 15 min per IP.
 *   - Per-user limiter for sensitive account actions (change-password,
 *     future password-reset, account delete) — keyed off the authenticated
 *     user id with IP fallback, so a single user can't brute-force
 *     password changes even across many IPs.
 *
 * Every limiter returns 429 in the standard `ApiFailure` envelope so the
 * frontend gets a consistent error contract from every error source.
 */
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { Request } from "express";
import type { Env } from "@clipflow/config";
import type { ApiFailure } from "@clipflow/types";

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
      const body: ApiFailure = {
        success: false,
        message: "Too many requests. Please slow down and try again shortly.",
        data: null,
        error: "RATE_LIMITED",
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
      const body: ApiFailure = {
        success: false,
        message: "Too many sign-in attempts. Please wait a few minutes and try again.",
        data: null,
        error: "RATE_LIMITED",
      };
      res.status(429).json(body);
    },
  });
};

/**
 * Options for `buildPerUserRateLimiter`.
 */
export interface PerUserRateLimiterOptions {
  /** Max requests per window. Required. */
  max: number;
  /** Window in ms. Defaults to env.RATE_LIMIT_WINDOW_MS. */
  windowMs?: number;
  /** Human-readable name for the 429 message (e.g. "password changes"). */
  resource: string;
}

/**
 * Build a per-user rate limiter for authenticated sensitive actions.
 *
 * Keyed off the authenticated user id (`req.user.id`), with an IP
 * fallback so the limiter also works on the (rare) unauthenticated
 * path — important because the `requireAuth` middleware runs AFTER
 * the limiter in our route wiring, so the limiter sees a request with
 * no `req.user` and falls back to IP. The order is intentional: we
 * want to throttle the *attempt* regardless of outcome, so a script
 * firing bad tokens against `/api/settings/change-password` still gets
 * rate-limited by IP.
 *
 * @param env Validated env (used for the default window).
 * @param options Per-user limiter config.
 * @returns Express middleware.
 */
export const buildPerUserRateLimiter = (
  env: Env,
  options: PerUserRateLimiterOptions,
): RateLimitRequestHandler => {
  return rateLimit({
    windowMs: options.windowMs ?? env.RATE_LIMIT_WINDOW_MS,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const userId = req.user?.id;
      if (userId) return `user:${userId}`;
      // `req.ip` is populated by Express when `trust proxy` is set
      // (see app.ts). Fall back to a constant so the key is always
      // a string — express-rate-limit requires a string key.
      return `ip:${req.ip ?? "unknown"}`;
    },
    handler: (_req, res) => {
      const body: ApiFailure = {
        success: false,
        message: `Too many ${options.resource}. Please wait a few minutes and try again.`,
        data: null,
        error: "RATE_LIMITED",
      };
      res.status(429).json(body);
    },
  });
};