/**
 * Zod schemas for YouTube module request/response validation.
 */
import { z } from "zod";

/**
 * GET /api/youtube/oauth/url — optional query params.
 */
export const getOAuthUrlSchema = z.object({
  /** If provided, the OAuth callback will redirect here after completion. */
  redirect_uri: z.string().url().optional(),
});

export type GetOAuthUrlQuery = z.infer<typeof getOAuthUrlSchema>;

/**
 * Google OAuth scope set for ClipFlow's YouTube integration.
 * Requested together per PRD.md Section 6a to avoid a second consent prompt.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
].join(" ");

/**
 * Google's OAuth 2.0 authorization endpoint.
 */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * Google's OAuth 2.0 token endpoint.
 */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Google's userinfo endpoint (used to verify the access token).
 */
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * YouTube Data API v3 channel endpoint.
 */
export const YOUTUBE_CHANNEL_URL = "https://www.googleapis.com/youtube/v3/channels";
