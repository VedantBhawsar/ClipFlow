/**
 * Preferences controller.
 *
 * Adapts HTTP requests to the preferences service. GET is served
 * through the in-memory cache (read-through, 30s TTL) — same pattern
 * as `meController` — so the dashboard's repeated hydration calls
 * don't all hit Postgres. PATCH and POST invalidate the relevant
 * cache keys so the next read sees the fresh state.
 *
 * Every response is routed through the centralized envelope helpers.
 */
import type { Request, Response } from "express";
import { cache } from "../../lib/cache.js";
import { sendEmpty, sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import * as preferencesService from "./preferences.service.js";
import type { ChangePasswordInput, UpdatePreferencesInput } from "./preferences.schemas.js";
import type { UserPreferences } from "@clipflow/types";
import "../auth/auth.types.js";

const PREFERENCES_CACHE_TTL_SECONDS = 30;

const preferencesCacheKey = (userId: string): string => `preferences:${userId}`;

/**
 * Drop the cached preferences entry for a user. Called after PATCH
 * (and after change-password, since password change conceptually
 * resets the user surface even if preferences themselves didn't move).
 *
 * @param userId User id whose cache entry should be cleared.
 */
export const invalidatePreferencesCache = async (userId: string): Promise<void> => {
  await cache.del(preferencesCacheKey(userId));
};

/**
 * GET /api/user/preferences — read-through cache.
 */
export const getPreferencesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  const userId = req.user.id;
  const key = preferencesCacheKey(userId);
  const cached = await cache.get(key);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    sendOk(res, JSON.parse(cached) as UserPreferences, "Preferences retrieved.");
    return;
  }
  const result = await preferencesService.getPreferences(userId);
  await cache.set(key, JSON.stringify(result), PREFERENCES_CACHE_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  sendOk(res, result, "Preferences retrieved.");
};

/**
 * PATCH /api/user/preferences — partial update.
 */
export const updatePreferencesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  const input = req.body as UpdatePreferencesInput;
  const result = await preferencesService.updatePreferences(req.user.id, input);
  await invalidatePreferencesCache(req.user.id);
  sendOk(res, result, "Preferences updated.");
};

/**
 * POST /api/user/change-password — verifies current, writes new.
 * Returns 200 with `data: null` so the frontend has a single envelope
 * contract for every endpoint (no 204 special case).
 */
export const changePasswordController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  const input = req.body as ChangePasswordInput;
  await preferencesService.changePassword(req.user.id, input);
  // Preferences cache is keyed off user id, not password, so it
  // doesn't strictly need to be invalidated here. We do it anyway
  // so any future "fetch all settings in one call" endpoint stays
  // honest about post-change state.
  await invalidatePreferencesCache(req.user.id);
  sendEmpty(res, "Password updated.");
};