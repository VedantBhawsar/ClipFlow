/**
 * Onboarding controller.
 *
 * Adapts HTTP requests to the onboarding service. After a profile
 * write, invalidates the `settings:${userId}` cache so the next
 * `GET /api/settings` reflects the fresh profile state. All responses
 * go through the centralized envelope helpers — auth failures throw
 * `AppError` so they're shaped by the central error middleware.
 */
import type { NextFunction, Request, Response } from "express";
import { sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import { invalidateSettingsCache } from "../settings/settings.service.js";
import * as onboardingService from "./onboarding.service.js";
import type { PatchProfileInput, UpdateProfileInput } from "./onboarding.schemas.js";
import "../auth/auth.types.js";

export const statusController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
    }
    const result = await onboardingService.getStatus(req.user.id);
    sendOk(res, result, "Onboarding status retrieved.");
  } catch (err) {
    next(err);
  }
};

export const updateProfileController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
    }
    const input = req.body as UpdateProfileInput;
    const result = await onboardingService.updateProfile(req.user.id, input);
    await invalidateSettingsCache(req.user.id);
    sendOk(res, result, "Profile saved.");
  } catch (err) {
    next(err);
  }
};

export const patchProfileController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
    }
    const input = req.body as PatchProfileInput;
    const result = await onboardingService.patchProfile(req.user.id, input);
    await invalidateSettingsCache(req.user.id);
    sendOk(res, result, "Profile updated.");
  } catch (err) {
    next(err);
  }
};