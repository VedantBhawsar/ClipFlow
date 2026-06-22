/**
 * Onboarding controller.
 *
 * Adapts HTTP requests to the onboarding service. Also invalidates the
 * `me` cache (legacy) and the `user` bundle cache so subsequent
 * `GET /api/auth/me` and `GET /api/user/profile` reflect the fresh
 * profile state.
 */
import type { Request, Response } from "express";
import { cache } from "../../lib/cache.js";
import { invalidateUserBundleCache } from "../user/user.controller.js";
import * as onboardingService from "./onboarding.service.js";
import type { PatchProfileInput, UpdateProfileInput } from "./onboarding.schemas.js";
import "../auth/auth.types.js";

const invalidateMeCache = async (userId: string): Promise<void> => {
  await cache.del(`me:${userId}`);
};

/**
 * Invalidate every cache entry that could embed the profile. Called
 * after a profile write so the next read is never stale.
 */
const invalidateProfileCaches = async (userId: string): Promise<void> => {
  await Promise.all([invalidateMeCache(userId), invalidateUserBundleCache(userId)]);
};

export const statusController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }
  const result = await onboardingService.getStatus(req.user.id);
  res.status(200).json(result);
};

export const updateProfileController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }
  const input = req.body as UpdateProfileInput;
  const result = await onboardingService.updateProfile(req.user.id, input);
  await invalidateProfileCaches(req.user.id);
  res.status(200).json(result);
};

export const patchProfileController = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }
  const input = req.body as PatchProfileInput;
  const result = await onboardingService.patchProfile(req.user.id, input);
  await invalidateProfileCaches(req.user.id);
  res.status(200).json(result);
};
