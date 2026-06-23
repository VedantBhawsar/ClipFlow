/**
 * YouTube OAuth service.
 *
 * Handles the Google OAuth flow for connecting a user's YouTube channel
 * to ClipFlow. Uses AES-256-GCM encryption for refresh tokens at rest.
 */
import { randomUUID } from "node:crypto";
import type { Env } from "@clipflow/config";
import type { YouTubeConnection } from "@clipflow/types";
import type { YouTubeChannel, ChannelConnectionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { encryptToken, decryptToken } from "../../lib/crypto.js";
import { AppError } from "../../errors/AppError.js";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  YOUTUBE_SCOPES,
} from "./youtube.schemas.js";
import {
  channelStatusToApi,
  type ConnectResult,
  type YouTubeChannelInfo,
} from "./youtube.types.js";

/**
 * Build the Google OAuth authorization URL.
 *
 * @param env Validated env.
 * @param redirectUri The callback URL.
 * @param state Optional state parameter for CSRF protection.
 * @returns The authorization URL to redirect the user to.
 */
export const buildOAuthUrl = (
  env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_REDIRECT_URI">,
  redirectUri: string,
  state?: string,
): string => {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(
      503,
      "GOOGLE_OAUTH_UNAVAILABLE",
      "Google OAuth is not configured. Please contact support.",
    );
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    ...(state && { state }),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

/**
 * Exchange an authorization code for tokens.
 */
const exchangeCodeForTokens = async (
  code: string,
  env: Pick<
    Env,
    "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI"
  >,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> => {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new AppError(
      400,
      "OAUTH_TOKEN_EXCHANGE_FAILED",
      `Google OAuth token exchange failed: ${error.error_description ?? "unknown"}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
};

/**
 * Fetch the authenticated user's own YouTube channel info.
 * Uses /channels?mine=true to get the user's channel (not subscriptions).
 */
const fetchYouTubeChannelInfo = async (
  accessToken: string,
): Promise<YouTubeChannelInfo | null> => {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?mine=true&part=snippet,contentDetails",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      502,
      "YOUTUBE_API_ERROR",
      `YouTube API error ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet: { title: string; thumbnails: { default?: { url: string } } };
      contentDetails: { relatedPlaylists: { uploads: string } };
    }>;
  };

  if (!data.items?.length) {
    throw new AppError(
      400,
      "NO_YOUTUBE_CHANNEL",
      "No YouTube channel found for this account. Please create a YouTube channel first.",
    );
  }

  const channel = data.items[0];
  if (!channel) {
    return null;
  }
  return {
    id: channel.id,
    title: channel.snippet.title,
    thumbnailUrl: channel.snippet.thumbnails.default?.url ?? null,
  };
};

/**
 * Connect a user's YouTube channel via OAuth code exchange.
 *
 * @param userId Authenticated user id.
 * @param code Authorization code from Google.
 * @param env Validated env.
 * @returns ConnectResult with the new connection.
 */
export const connectYouTubeChannel = async (
  userId: string,
  code: string,
  env: Pick<
    Env,
    | "GOOGLE_CLIENT_ID"
    | "GOOGLE_CLIENT_SECRET"
    | "GOOGLE_REDIRECT_URI"
    | "ENCRYPTION_KEY"
  >,
): Promise<ConnectResult | null> => {
  requireDatabase();

  // Exchange code for tokens
  const { accessToken, refreshToken } = await exchangeCodeForTokens(code, env);

  // Fetch channel info
  const channelInfo = await fetchYouTubeChannelInfo(accessToken);

  if (!channelInfo) {
    return null;
  }

  // Encrypt the refresh token for storage
  const refreshTokenEncrypted = encryptToken(refreshToken, env.ENCRYPTION_KEY);

  // Upsert the YouTubeChannel record
  const channel = await prisma.youTubeChannel.upsert({
    where: { userId },
    update: {
      youtubeChannelId: channelInfo.id,
      channelTitle: channelInfo.title,
      channelThumbnailUrl: channelInfo.thumbnailUrl,
      refreshTokenEncrypted,
      scopes: YOUTUBE_SCOPES,
      status: "CONNECTED",
      lastVerifiedAt: new Date(),
    },
    create: {
      userId,
      youtubeChannelId: channelInfo.id,
      channelTitle: channelInfo.title,
      channelThumbnailUrl: channelInfo.thumbnailUrl,
      refreshTokenEncrypted,
      scopes: YOUTUBE_SCOPES,
      status: "CONNECTED",
    },
  });

  return {
    connection: toYouTubeConnection(channel),
  };
};

/**
 * Disconnect a user's YouTube channel.
 *
 * @param userId Authenticated user id.
 */
export const disconnectYouTubeChannel = async (
  userId: string,
): Promise<void> => {
  requireDatabase();
  await prisma.youTubeChannel.deleteMany({
    where: { userId },
  });
};

/**
 * Get the YouTube connection for a user.
 *
 * @param userId Authenticated user id.
 * @returns YouTubeConnection DTO, or a disconnected stub if no connection exists.
 */
export const getYouTubeConnectionByUserId = async (
  userId: string,
): Promise<YouTubeConnection> => {
  requireDatabase();

  const channel = await prisma.youTubeChannel.findUnique({
    where: { userId },
  });

  if (!channel) {
    return disconnectedStub();
  }

  return toYouTubeConnection(channel);
};

/**
 * Refresh an expired access token using the stored refresh token.
 *
 * @param channel The YouTubeChannel row with encrypted refresh token.
 * @param env Validated env.
 * @returns New access token and its expiry time.
 */
export const refreshAccessToken = async (
  channel: YouTubeChannel,
  env: Pick<
    Env,
    "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "ENCRYPTION_KEY"
  >,
): Promise<{ accessToken: string; expiresAt: Date }> => {
  const refreshToken = decryptToken(
    channel.refreshTokenEncrypted,
    env.ENCRYPTION_KEY,
  );

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // Refresh token is invalid or expired — mark channel as needing reauth
    await prisma.youTubeChannel.update({
      where: { id: channel.id },
      data: { status: "NEEDS_REAUTH" },
    });
    throw new AppError(
      401,
      "YOUTUBE_TOKEN_REFRESH_FAILED",
      "YouTube channel access has expired. Please reconnect your channel.",
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
};

/**
 * Map a Prisma YouTubeChannel row to the YouTubeConnection DTO.
 */
const toYouTubeConnection = (channel: YouTubeChannel): YouTubeConnection => {
  return {
    status: channelStatusToApi(channel.status),
    channelId: channel.youtubeChannelId,
    channelTitle: channel.channelTitle,
    channelThumbnailUrl: channel.channelThumbnailUrl,
    connectedAt: channel.createdAt.toISOString(),
    lastVerifiedAt: channel.lastVerifiedAt.toISOString(),
  };
};

/**
 * Returns a disconnected stub for users who haven't connected YouTube.
 */
const disconnectedStub = (): YouTubeConnection => ({
  status: "disconnected",
  channelId: null,
  channelTitle: null,
  channelThumbnailUrl: null,
  connectedAt: null,
  lastVerifiedAt: null,
});
