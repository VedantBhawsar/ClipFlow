/**
 * Token refresh for a stored YouTube connection.
 *
 * Moved out of `apps/api/src/modules/youtube/youtube.service.ts` so the
 * worker can call it without depending on the API package. The API
 * re-exports this function for its own internal callers.
 *
 * Uses raw `fetch` to Google's token endpoint — the YouTube service
 * already does this so we keep the dependency surface small.
 */
import { decryptToken } from "@clipflow/crypto";
import type { Env } from "@clipflow/config";
import type { YouTubeChannel, PrismaClient } from "@prisma/client";
import { PermanentPublishError, TransientPublishError } from "./errors.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface RefreshedAccessToken {
  accessToken: string;
  expiresAt: Date;
}

/**
 * Refresh an expired access token using the stored (encrypted) refresh
 * token. On failure the channel is marked `NEEDS_REAUTH` so the UI can
 * prompt the user to reconnect, and a typed error is thrown.
 *
 * @param prisma Prisma client (passed in so tests can stub).
 * @param channel YouTubeChannel row carrying the encrypted refresh token.
 * @param env Validated env.
 * @returns New access token + expiry timestamp.
 */
export const refreshAccessToken = async (
  prisma: PrismaClient,
  channel: YouTubeChannel,
  env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "ENCRYPTION_KEY">,
): Promise<RefreshedAccessToken> => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set to refresh YouTube tokens.",
    );
  }

  const refreshToken = decryptToken(
    channel.refreshTokenEncrypted,
    env.ENCRYPTION_KEY,
  );

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });
  } catch (err) {
    throw new TransientPublishError(
      `Network failure refreshing YouTube access token: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Mark channel as needing reauth. The 400/401 case from Google means
    // the refresh token is no longer valid (revoked, expired, or scope
    // change). We treat all non-2xx as needing reauth for v1; quota
    // errors at this endpoint are vanishingly rare.
    await prisma.youTubeChannel
      .update({
        where: { id: channel.id },
        data: { status: "NEEDS_REAUTH" },
      })
      .catch(() => {
        // best-effort; if the DB write fails we still surface the auth error
      });
    throw new PermanentPublishError(
      "CHANNEL_NEEDS_REAUTH",
      `YouTube token refresh failed (${res.status}): ${body.slice(0, 200)}`,
      res.status,
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

export const GOOGLE_TOKEN_ENDPOINT = GOOGLE_TOKEN_URL;