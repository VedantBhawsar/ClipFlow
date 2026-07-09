/**
 * YouTube OAuth service.
 *
 * Handles the Google OAuth flow for connecting a user's YouTube channel
 * to ClipFlow. Uses AES-256-GCM encryption for refresh tokens at rest.
 *
 * `refreshAccessToken` lives in `@clipflow/youtube-upload` so the
 * worker can call it without depending on the API package. Re-exported
 * here for the few API-side callers that still want it from this path.
 */
import type { Env } from "@clipflow/config";
import type {
  ChannelRecentThumbnail,
  YouTubeConnection,
} from "@clipflow/types";
import type { YouTubeChannel } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { encryptToken } from "../../lib/crypto.js";
import { AppError } from "../../errors/AppError.js";
import {
  listChannelRecentVideos,
  PermanentPublishError,
  refreshAccessToken as refreshAccessTokenInPackage,
  TransientPublishError,
} from "@clipflow/youtube-upload";
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
 * Sets the channel status to DISCONNECTED instead of deleting the row
 * so that existing videos (and their metadata) persist. Users can still
 * view their videos but cannot publish new ones or unpublish existing
 * ones until they reconnect.
 *
 * @param userId Authenticated user id.
 */
export const disconnectYouTubeChannel = async (
  userId: string,
): Promise<void> => {
  requireDatabase();
  await prisma.youTubeChannel.updateMany({
    where: { userId },
    data: { status: "DISCONNECTED" },
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
 * Thin wrapper over the package implementation that translates the
 * typed {@link PermanentPublishError} (raised by the package on
 * CHANNEL_NEEDS_REAUTH) into the legacy `AppError(401,
 * YOUTUBE_TOKEN_REFRESH_FAILED)` shape so existing API callers don't
 * need to update their catch blocks.
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
  try {
    return await refreshAccessTokenInPackage(prisma, channel, env);
  } catch (err) {
    // Translate package's typed error into the legacy API error shape.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "PERMANENT_PUBLISH_ERROR" &&
      "reasonCode" in err &&
      (err as { reasonCode?: string }).reasonCode === "CHANNEL_NEEDS_REAUTH"
    ) {
      throw new AppError(
        401,
        "YOUTUBE_TOKEN_REFRESH_FAILED",
        "YouTube channel access has expired. Please reconnect your channel.",
      );
    }
    throw err;
  }
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

/**
 * Fetch the most recent video thumbnails for the connected channel.
 *
 * Used by the onboarding wizard's step 5 and the settings "Refresh my
 * channel style" CTA to populate the 4×2 thumbnail-selection grid.
 * Delegates the YouTube call to `listChannelRecentVideos` in the shared
 * package; the OAuth scope (`youtube.readonly`) is already on the access
 * token returned by {@link refreshAccessToken}.
 *
 * Errors from the package's YouTube call are translated to `AppError`
 * so the central error middleware can serialize them with a meaningful
 * status + code (mirrors the `mapYouTubeErrorToAppError` pattern in
 * videos.service.ts — see the "Domain errors from @clipflow/youtube-upload
 * MUST be mapped to AppError" do-not-repeat entry).
 *
 * @throws AppError 412 `YOUTUBE_NOT_CONNECTED` if the channel isn't
 *   connected (this is distinct from `CHANNEL_NOT_CONNECTED` used inside
 *   the publish path; here we want a clearer code for the wizard UI).
 * @throws AppError translated from the package's PermanentPublishError /
 *   TransientPublishError on YouTube API failures.
 */
export const getChannelRecentThumbnails = async (
  userId: string,
  maxResults: number,
  env: Pick<
    Env,
    "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "ENCRYPTION_KEY"
  >,
): Promise<ChannelRecentThumbnail[]> => {
  requireDatabase();

  const channel = await prisma.youTubeChannel.findUnique({
    where: { userId },
  });

  if (!channel || channel.status !== "CONNECTED") {
    throw new AppError(
      412,
      "YOUTUBE_NOT_CONNECTED",
      "Connect your YouTube channel to see your recent thumbnails.",
    );
  }

  const { accessToken } = await refreshAccessToken(channel, env);

  try {
    return await listChannelRecentVideos(accessToken, {
      channelId: channel.youtubeChannelId,
      maxResults,
    });
  } catch (err) {
    if (err instanceof PermanentPublishError) {
      throw new AppError(
        403,
        "YOUTUBE_FORBIDDEN",
        err.message || "YouTube rejected the thumbnail list request.",
        err.httpStatus !== undefined
          ? { upstreamStatus: err.httpStatus }
          : undefined,
      );
    }
    if (err instanceof TransientPublishError) {
      throw new AppError(
        503,
        "YOUTUBE_TEMPORARILY_UNAVAILABLE",
        err.message ||
          "YouTube is temporarily unavailable. Please try again in a moment.",
        err.httpStatus !== undefined
          ? { upstreamStatus: err.httpStatus }
          : undefined,
      );
    }
    throw err;
  }
};
