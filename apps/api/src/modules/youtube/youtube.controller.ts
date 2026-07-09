/**
 * YouTube OAuth controller.
 *
 * Handles HTTP requests for the YouTube connection flow:
 *   GET  /api/youtube/oauth/url   — get the Google OAuth URL to redirect to
 *   GET  /api/youtube/oauth/callback — OAuth callback (handled by Google directly)
 *   POST /api/youtube/connect      — exchange code for tokens, store connection
 *   DELETE /api/youtube/disconnect — remove connection
 *   GET  /api/youtube/connection   — get current connection status
 *
 * The OAuth "callback" is actually handled by the frontend because we're not
 * using server-side sessions — the frontend receives the code and passes it
 * to POST /connect. This keeps the flow stateless (no session cookies needed).
 *
 * Every response is routed through the centralized envelope helpers.
 * Auth failures and configuration errors throw `AppError` so the central
 * error middleware emits the failure body in the same shape as every
 * other error.
 */
import type { Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { cache } from "../../lib/cache.js";
import { sendEmpty, sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import {
  buildOAuthUrl,
  connectYouTubeChannel,
  disconnectYouTubeChannel,
  getChannelRecentThumbnails,
  getYouTubeConnectionByUserId,
} from "./youtube.service.js";
import type { ChannelRecentThumbnailsQuery } from "./youtube.schemas.js";
import type {
  ChannelRecentThumbnailsResponse,
  YouTubeConnection,
} from "@clipflow/types";

const CONNECTION_CACHE_TTL_SECONDS = 60;

const requireEnv = (req: Request): Env => {
  const env = req.app.get("env") as Env | undefined;
  if (!env) {
    throw new AppError(500, "ENV_UNAVAILABLE", "Server is not configured.");
  }
  return env;
};

const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  return req.user.id;
};

/**
 * GET /api/youtube/oauth/url
 *
 * Returns the Google OAuth authorization URL. The frontend should redirect
 * the browser to this URL to initiate the OAuth flow.
 */
export const getOAuthUrlController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const env = requireEnv(req);

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    throw new AppError(
      503,
      "GOOGLE_OAUTH_UNAVAILABLE",
      "Google OAuth is not configured on this server.",
    );
  }

  // Generate a state parameter for CSRF protection
  const state = Buffer.from(
    JSON.stringify({ redirect_uri: req.query.redirect_uri ?? "/" }),
  ).toString("base64");

  const url = buildOAuthUrl(env, env.GOOGLE_REDIRECT_URI, state);

  sendOk(res, { url }, "OAuth URL minted.");
};

/**
 * POST /api/youtube/connect
 *
 * Exchange an OAuth authorization code for tokens and store the connection.
 * The code is passed from the frontend after the Google OAuth popup closes.
 */
export const connectController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);

  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string") {
    throw new AppError(400, "INVALID_REQUEST", "Authorization code is required.");
  }

  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REDIRECT_URI
  ) {
    throw new AppError(
      503,
      "GOOGLE_OAUTH_UNAVAILABLE",
      "Google OAuth is not configured on this server.",
    );
  }

  const result = await connectYouTubeChannel(userId, code, env);
  if (!result) {
    throw new Error("Account Not found");
  }

  // Invalidate the lazy settings cache since YouTube connection changed.
  await cache.del(`settings:${userId}`);

  sendOk(res, result.connection, "YouTube channel connected.");
};

/**
 * DELETE /api/youtube/disconnect
 *
 * Remove the YouTube channel connection for the authenticated user.
 */
export const disconnectController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);

  await disconnectYouTubeChannel(userId);

  // Invalidate the lazy settings cache since YouTube connection changed.
  await cache.del(`settings:${userId}`);

  sendEmpty(res, "YouTube channel disconnected.");
};

/**
 * GET /api/youtube/connection
 *
 * Get the current YouTube connection status and channel info.
 * Cached for 60 seconds to keep dashboard loads snappy.
 */
export const getConnectionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);

  const cacheKey = `youtube:connection:${userId}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    res.setHeader("X-Cache", "HIT");
    sendOk(
      res,
      JSON.parse(cached) as YouTubeConnection,
      "YouTube connection retrieved.",
    );
    return;
  }

  const connection = await getYouTubeConnectionByUserId(userId);

  await cache.set(cacheKey, JSON.stringify(connection), CONNECTION_CACHE_TTL_SECONDS);

  res.setHeader("X-Cache", "MISS");
  sendOk(res, connection, "YouTube connection retrieved.");
};

/**
 * GET /api/youtube/channel-recent-thumbnails
 *
 * Return up to N (default 8, max 8) of the user's most recent YouTube
 * video thumbnails. The wizard's step 5 and the settings re-style CTA
 * render these in a 4×2 grid for the user to pick up to 4.
 *
 * Throws 412 `YOUTUBE_NOT_CONNECTED` if the user has no connected
 * channel — the wizard handles that case with an inline "Connect
 * YouTube first" prompt, but the API also surfaces it cleanly so
 * other callers can branch on the code.
 */
export const channelRecentThumbnailsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const { limit } = req.query as unknown as ChannelRecentThumbnailsQuery;
  const clampedLimit = Math.min(Math.max(limit ?? 8, 1), 8);

  const items = await getChannelRecentThumbnails(userId, clampedLimit, env);
  const payload: ChannelRecentThumbnailsResponse = { items };
  sendOk(res, payload, "Channel thumbnails retrieved.");
};