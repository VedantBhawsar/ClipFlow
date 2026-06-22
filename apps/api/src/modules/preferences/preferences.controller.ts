/**
 * Preferences controller.
 *
 * Adapts HTTP requests to the preferences service. GET is served
 * through the in-memory cache (read-through, 30s TTL) — same pattern
 * as `meController` — so the dashboard's repeated hydration calls
 * don't all hit Postgres. PATCH and POST invalidate the relevant
 * cache keys so the next read sees the fresh state.
 */
import type { Request, Response } from "express";
import { cache } from "../../lib/cache.js";
import * as preferencesService from "./preferences.service.js";
import type { ChangePasswordInput, UpdatePreferencesInput } from "./preferences.schemas.js";
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
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }
  const userId = req.user.id;
  const key = preferencesCacheKey(userId);
  const cached = await cache.get(key);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.status(200).type("application/json").send(cached);
    return;
  }
  const result = await preferencesService.getPreferences(userId);
  const payload = JSON.stringify(result);
  await cache.set(key, payload, PREFERENCES_CACHE_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  res.status(200).type("application/json").send(payload);
};

/**
 * PATCH /api/user/preferences — partial update.
 */
export const updatePreferencesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }
  const input = req.body as UpdatePreferencesInput;
  const result = await preferencesService.updatePreferences(req.user.id, input);
  await invalidatePreferencesCache(req.user.id);
  res.status(200).json(result);
};

/**
 * POST /api/user/change-password — verifies current, writes new.
 * 204 on success (no body — the client doesn't need a re-issued token
 * because the JWT is unchanged; client just keeps using it).
 */
export const changePasswordController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }
  const input = req.body as ChangePasswordInput;
  await preferencesService.changePassword(req.user.id, input);
  // Preferences cache is keyed off user id, not password, so it
  // doesn't strictly need to be invalidated here. We do it anyway
  // so any future "fetch all settings in one call" endpoint stays
  // honest about post-change state.
  await invalidatePreferencesCache(req.user.id);
  res.status(204).send();
};
