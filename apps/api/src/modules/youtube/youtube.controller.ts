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
 */
import type { Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { cache } from "../../lib/cache.js";
import {
  buildOAuthUrl,
  connectYouTubeChannel,
  disconnectYouTubeChannel,
  getYouTubeConnectionByUserId,
} from "./youtube.service.js";

const CONNECTION_CACHE_TTL_SECONDS = 60;

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
  const env = req.app.get("env") as Env;

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    res.status(503).json({
      error: "GOOGLE_OAUTH_UNAVAILABLE",
      message: "Google OAuth is not configured on this server.",
    });
    return;
  }

  // Generate a state parameter for CSRF protection
  const state = Buffer.from(
    JSON.stringify({ redirect_uri: req.query.redirect_uri ?? "/" }),
  ).toString("base64");

  const url = buildOAuthUrl(env, env.GOOGLE_REDIRECT_URI, state);

  res.status(200).json({ url });
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
  if (!req.user) {
    res
      .status(401)
      .json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }

  const env = req.app.get("env") as Env;

  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string") {
    res
      .status(400)
      .json({
        error: "INVALID_REQUEST",
        message: "Authorization code is required.",
      });
    return;
  }

  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REDIRECT_URI
  ) {
    res.status(503).json({
      error: "GOOGLE_OAUTH_UNAVAILABLE",
      message: "Google OAuth is not configured on this server.",
    });
    return;
  }

  try {
    const result = await connectYouTubeChannel(req.user.id, code, env);

    if (!result) {
      throw new Error("Account Not found");
    }

    // Invalidate the user bundle cache since YouTube connection changed
    await cache.del(`user:${req.user.id}`);

    res.status(200).json(result.connection);
  } catch (err) {
    if (err instanceof Error && "statusCode" in err) {
      throw err;
    }
    res
      .status(500)
      .json({
        error: "INTERNAL_ERROR",
        message: "Failed to connect YouTube channel.",
      });
  }
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
  if (!req.user) {
    res
      .status(401)
      .json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }

  await disconnectYouTubeChannel(req.user.id);

  // Invalidate the user bundle cache since YouTube connection changed
  await cache.del(`user:${req.user.id}`);

  res.status(204).send();
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
  if (!req.user) {
    res
      .status(401)
      .json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    return;
  }

  const cacheKey = `youtube:connection:${req.user.id}`;
  const cached = await cache.get(cacheKey);

  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.status(200).type("application/json").send(cached);
    return;
  }

  const connection = await getYouTubeConnectionByUserId(req.user.id);
  const payload = JSON.stringify(connection);

  await cache.set(cacheKey, payload, CONNECTION_CACHE_TTL_SECONDS);

  res.setHeader("X-Cache", "MISS");
  res.status(200).type("application/json").send(payload);
};
