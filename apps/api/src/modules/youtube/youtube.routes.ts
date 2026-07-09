/**
 * YouTube OAuth route definitions.
 *
 * Mounts under `/api/youtube` (the actual mount point is in `app.ts`).
 *
 * Endpoints:
 *   GET  /api/youtube/oauth/url     — get Google OAuth URL
 *   POST /api/youtube/connect      — exchange OAuth code for connection
 *   DELETE /api/youtube/disconnect — remove connection
 *   GET  /api/youtube/connection   — get current connection status (cached)
 *
 * Rate limiting:
 *   - connect is rate-limited to 10 per 15 min per user (sensitive action)
 *   - other endpoints use the global rate limit
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { buildPerUserRateLimiter } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import {
  channelRecentThumbnailsController,
  getOAuthUrlController,
  connectController,
  disconnectController,
  getConnectionController,
} from "./youtube.controller.js";
import { channelRecentThumbnailsQuerySchema } from "./youtube.schemas.js";
import "../auth/auth.types.js";

/**
 * Build the YouTube router.
 */
export const buildYouTubeRouter = (env: Env): Router => {
  const router = Router();
  const auth = requireAuth(env);

  // Strict rate limiter for the connect action (prevents token exchange abuse)
  const connectLimiter = buildPerUserRateLimiter(env, {
    max: 10,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    resource: "channel connections",
  });

  /**
   * GET /api/youtube/oauth/url
   * Returns the Google OAuth authorization URL for the frontend to redirect to.
   */
  router.get("/oauth/url", auth, getOAuthUrlController);

  /**
   * POST /api/youtube/connect
   * Exchange OAuth code for tokens and store the channel connection.
   * Rate-limited per user to prevent abuse.
   */
  router.post("/connect", auth, connectLimiter, connectController);

  /**
   * DELETE /api/youtube/disconnect
   * Remove the YouTube channel connection.
   */
  router.delete("/disconnect", auth, disconnectController);

  /**
   * GET /api/youtube/connection
   * Get current connection status and channel info. Cached for 60s.
   */
  router.get("/connection", auth, getConnectionController);

  /**
   * GET /api/youtube/channel-recent-thumbnails
   * Return up to 8 of the connected channel's most recent video thumbnails.
   * Used by the onboarding wizard's step 5 and the settings "Refresh my
   * channel style" CTA. 412 if the channel isn't connected.
   */
  router.get(
    "/channel-recent-thumbnails",
    auth,
    validate({ query: channelRecentThumbnailsQuerySchema }),
    channelRecentThumbnailsController,
  );

  return router;
};
