/**
 * User-bundle controller.
 *
 * Adapts the combined-read service to HTTP. The bundle is cached
 * for 30s with a single cache key, so a UI that hydrates from this
 * endpoint on every page load doesn't repeatedly hit Postgres.
 *
 * The cache is invalidated by every write that could change the
 * bundle (profile patch, preferences patch, change-password). The
 * invalidation helpers live in their respective controllers and are
 * called from `app.ts` after a successful write.
 */
import type { Request, Response } from "express";
import { cache } from "../../lib/cache.js";
import { getUserBundle } from "./user.service.js";
import "../auth/auth.types.js";

const BUNDLE_CACHE_TTL_SECONDS = 30;

export const userBundleCacheKey = (userId: string): string => `user:${userId}`;

/**
 * Drop the cached bundle entry for a user. Exported so the
 * profile/preferences controllers (and any future write paths) can
 * invalidate the bundle whenever a write happens, without importing
 * this controller's internals.
 *
 * @param userId User id whose cache entry should be cleared.
 */
export const invalidateUserBundleCache = async (userId: string): Promise<void> => {
  await cache.del(userBundleCacheKey(userId));
};

/**
 * GET /api/user/profile — read-through cached bundle.
 */
export const getUserBundleController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }
  const userId = req.user.id;
  const key = userBundleCacheKey(userId);
  const cached = await cache.get(key);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.status(200).type("application/json").send(cached);
    return;
  }
  const result = await getUserBundle(userId);
  const payload = JSON.stringify(result);
  await cache.set(key, payload, BUNDLE_CACHE_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  res.status(200).type("application/json").send(payload);
};
