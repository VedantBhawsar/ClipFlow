/**
 * Auth controller.
 *
 * Adapts HTTP requests to the auth service. Keeps the request/response
 * shaping here so the service stays free of Express types. Every
 * response is emitted through the centralized `sendOk` / `sendCreated`
 * / `sendEmpty` helpers — there is no inline `res.status().json()`
 * in this file, by design.
 */
import type { Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { cache } from "../../lib/cache.js";
import { sendCreated, sendEmpty, sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import * as authService from "./auth.service.js";
import type {
  LogoutInput,
  RefreshInput,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
} from "./auth.schemas.js";
import type { MeResponse } from "@clipflow/types";
import "./auth.types.js";

/**
 * Invalidate the 30s `me` cache entry for a user. Called after login/register
 * so the next `GET /api/auth/me` reflects the latest user state.
 */
const invalidateMeCache = async (userId: string): Promise<void> => {
  await cache.del(`me:${userId}`);
};

export const registerController =
  (env: Env) =>
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as RegisterInput;
    const result = await authService.register(input, env);
    await invalidateMeCache(result.user.id);
    sendCreated(res, result, "Account created.");
  };

export const loginController =
  (env: Env) =>
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as LoginInput;
    const result = await authService.login(input, env);
    await invalidateMeCache(result.user.id);
    sendOk(res, result, "Signed in.");
  };

/**
 * POST /api/auth/refresh
 *
 * Body: `{ refreshToken: string }`. The refresh token IS the credential —
 * no `Authorization` header. On success, returns a fresh
 * `{ accessToken, refreshToken, ... }` pair. On any failure (unknown,
 * expired, or reuse-detected), returns 401.
 */
export const refreshController =
  (env: Env) =>
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as RefreshInput;
    const result = await authService.refresh(input.refreshToken, env);
    sendOk(res, result, "Token refreshed.");
  };

export const logoutController = async (req: Request, res: Response): Promise<void> => {
  const input = (req.body ?? {}) as LogoutInput;
  await authService.logout(input);
  sendEmpty(res, "Signed out.");
};

/**
 * Returns the authenticated user's profile + onboarding status. Reads
 * through a 30s in-memory cache to demonstrate the cache abstraction is
 * wired (low-priority optimization, but required to be present).
 */
export const meController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  const userId = req.user.id;
  const cacheKey = `me:${userId}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    sendOk(res, JSON.parse(cached) as MeResponse, "User bundle retrieved.");
    return;
  }
  const result = await authService.me(userId);
  await cache.set(cacheKey, JSON.stringify(result), 30);
  res.setHeader("X-Cache", "MISS");
  sendOk(res, result, "User bundle retrieved.");
};

export const googleController = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as GoogleAuthInput;
  await authService.googleSignIn(input.idToken);
  // 501 Not Implemented — wraps the original AppError thrown inside the
  // service so it travels through the central error handler in the
  // envelope shape. (No need to throw here; service already throws.)
  throw new AppError(
    501,
    "NOT_IMPLEMENTED",
    "Google sign-in ships in the next slice.",
  );
};