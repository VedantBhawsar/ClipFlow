/**
 * YouTube module types.
 *
 * These types are used internally by the API module and map Prisma rows
 * to the DTO shape returned to clients.
 */
import type { ChannelConnectionStatus } from "@clipflow/types";
import type { YouTubeConnection } from "@clipflow/types";

export { type YouTubeConnection } from "@clipflow/types";

/**
 * Map Prisma ChannelConnectionStatus enum to the API string union.
 */
export const channelStatusToApi = (
  status: ChannelConnectionStatus,
): YouTubeConnection["status"] => {
  switch (status) {
    case "CONNECTED":
      return "connected";
    case "NEEDS_REAUTH":
      return "needs_reauth";
    case "DISCONNECTED":
      return "disconnected";
  }
};

/**
 * Google OAuth token response shape.
 */
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

/**
 * YouTube channel info fetched from Google's API.
 */
export interface YouTubeChannelInfo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

/**
 * Result of a complete OAuth connect flow: exchange code for tokens,
 * fetch channel info, and store the connection.
 */
export interface ConnectResult {
  connection: YouTubeConnection;
}
