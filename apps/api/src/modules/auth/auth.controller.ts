/**
 * Auth controller.
 *
 * Adapts HTTP requests to the auth service. Keeps the request/response
 * shaping here so the service stays free of Express types.
 */
import type { Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { cache } from "../../lib/cache.js";
import * as authService from "./auth.service.js";
import type { GoogleAuthInput, LoginInput, RegisterInput } from "./auth.schemas.js";
import "./auth.types.js";

/**
 * Invalidate the 30s `me` cache entry for a user. Called after login/register
 * so the next `GET /api/auth/me` reflects the latest user state.
 *
 * @param userId User id whose cache entry should be cleared.
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
    res.status(201).json(result);
  };

export const loginController =
  (env: Env) =>
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as LoginInput;
    const result = await authService.login(input, env);
    await invalidateMeCache(result.user.id);
    res.status(200).json(result);
  };

export const logoutController = async (_req: Request, res: Response): Promise<void> => {
  await authService.logout();
  res.status(204).send();
};

/**
 * Returns the authenticated user's profile + onboarding status. Reads
 * through a 30s in-memory cache to demonstrate the cache abstraction is
 * wired (low-priority optimization, but required to be present).
 */
export const meController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    // `requireAuth` should have populated this. Defensive 401.
    res.status(401).json({
      error: "UNAUTHENTICATED",
      message: "Authentication required.",
    });
    return;
  }
  const userId = req.user.id;
  const cacheKey = `me:${userId}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.status(200).type("application/json").send(cached);
    return;
  }
  const result = await authService.me(userId);
  const payload = JSON.stringify(result);
  await cache.set(cacheKey, payload, 30);
  res.setHeader("X-Cache", "MISS");
  res.status(200).type("application/json").send(payload);
};

export const googleController = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as GoogleAuthInput;
  await authService.googleSignIn(input.idToken);
  // The service throws 501 before reaching here. The explicit 501
  // response below is defensive — if the service is later updated to
  // return a value, this keeps the type contract honest.
  res.status(501).json({
    error: "NOT_IMPLEMENTED",
    message: "Google sign-in ships in the next slice.",
  });
};
