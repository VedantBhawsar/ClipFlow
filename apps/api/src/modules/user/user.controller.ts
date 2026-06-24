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
 *
 * Every response is routed through the centralized `sendOk` helper
 * so the wire envelope is identical to other modules.
 */
import type { Request, Response } from "express";
import { cache } from "../../lib/cache.js";
import { sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import { getUserBundle } from "./user.service.js";
import { getYouTubeConnectionByUserId } from "../youtube/youtube.service.js";
import type { UserBundleResponse, YouTubeConnection } from "@clipflow/types";
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
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  const userId = req.user.id;
  const key = userBundleCacheKey(userId);
  const cached = await cache.get(key);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    sendOk(res, JSON.parse(cached) as UserBundleResponse, "User bundle retrieved.");
    return;
  }
  const result = await getUserBundle(userId);
  await cache.set(key, JSON.stringify(result), BUNDLE_CACHE_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  sendOk(res, result, "User bundle retrieved.");
};

/**
 * GET /api/user/youtube-connection — narrow YouTube connection read.
 *
 * Returns the same `YouTubeConnection` DTO the bundle exposes under
 * `data.youtubeConnection`, wrapped in the standard success envelope.
 *
 * The wire contract MUST match the centralized envelope (`sendOk`).
 * The frontend `api-client` reads `response.json().data` directly;
 * returning a bare DTO here causes `useYouTubeConnection()` to throw
 * "Unexpected response from server." and the YouTubeConnectCard falls
 * back to its "disconnected" UI even when the channel is connected —
 * which is why the dashboard can show "Connect your YouTube channel"
 * after a successful OAuth.
 */
export const getYouTubeConnectionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    // Defensive: requireAuth should have populated this, but throw the
    // canonical AppError instead of writing a raw {error, message}
    // shape so the central error middleware emits the right envelope.
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  const connection: YouTubeConnection = await getYouTubeConnectionByUserId(
    req.user.id,
  );
  sendOk(res, connection, "YouTube connection retrieved.");
};