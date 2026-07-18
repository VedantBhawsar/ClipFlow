/**
 * Preferences controller.
 *
 * Adapts HTTP requests to the preferences service. The narrow
 * GET/PATCH endpoints are mounted under `/api/settings` (see
 * `preferences.routes.ts` + the mount in `app.ts`) so the URL space
 * is one tree. Every write invalidates the lazy `settings:${userId}`
 * cache so a subsequent `GET /api/settings` doesn't return stale
 * preferences.
 */
import type { NextFunction, Request, Response } from "express";
import { sendEmpty, sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import * as preferencesService from "./preferences.service.js";
import { invalidateSettingsCache } from "../settings/settings.service.js";
import type { ChangePasswordInput, UpdatePreferencesInput } from "./preferences.schemas.js";
import type { UserPreferences } from "@clipflow/types";
import "../auth/auth.types.js";

/**
 * GET /api/settings/preferences — narrow read.
 *
 * Returns just the `UserPreferences` row; the dashboard no longer
 * uses this on hydration (it uses NextAuth session + the lazy
 * `GET /api/settings` bundle when on the settings pages).
 */
export const getPreferencesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
    }
    const result: UserPreferences = await preferencesService.getPreferences(req.user.id);
    sendOk(res, result, "Preferences retrieved.");
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/settings/preferences — partial update.
 */
export const updatePreferencesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
    }
    const input = req.body as UpdatePreferencesInput;
    const result = await preferencesService.updatePreferences(req.user.id, input);
    await invalidateSettingsCache(req.user.id);
    sendOk(res, result, "Preferences updated.");
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/settings/change-password — verifies current, writes new.
 */
export const changePasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
    }
    const input = req.body as ChangePasswordInput;
    await preferencesService.changePassword(req.user.id, input);
    await invalidateSettingsCache(req.user.id);
    sendEmpty(res, "Password updated.");
  } catch (err) {
    next(err);
  }
};