import { describe, it, expect, vi, beforeEach } from "vitest";
import * as youtubeService from "./youtube.service.js";

vi.mock("@clipflow/youtube-upload", () => ({
  refreshAccessToken: vi.fn(),
  PermanentPublishError: class PermanentPublishError extends Error {
    readonly code = "PERMANENT_PUBLISH_ERROR" as const;
    readonly reasonCode: string;
    readonly httpStatus?: number;
    constructor(reasonCode: string, message: string, httpStatus?: number) {
      super(message);
      this.name = "PermanentPublishError";
      this.reasonCode = reasonCode;
      this.httpStatus = httpStatus;
    }
  },
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    youTubeChannel: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../lib/db-guard.js", () => ({
  requireDatabase: vi.fn(),
}));

vi.mock("../../lib/crypto.js", () => ({
  encryptToken: vi.fn().mockReturnValue("encrypted_token"),
}));

vi.mock("../../lib/logger.js", () => ({
  buildLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { prisma } from "../../lib/prisma.js";
import { encryptToken } from "../../lib/crypto.js";
import {
  refreshAccessToken,
  PermanentPublishError,
} from "@clipflow/youtube-upload";

const mockUpsert = vi.mocked(prisma.youTubeChannel.upsert);
const mockFindUnique = vi.mocked(prisma.youTubeChannel.findUnique);
const mockDeleteMany = vi.mocked(prisma.youTubeChannel.deleteMany);
const mockUpdateMany = vi.mocked(prisma.youTubeChannel.updateMany);
const mockUpdate = vi.mocked(prisma.youTubeChannel.update);
const mockEncrypt = vi.mocked(encryptToken);
const mockRefreshAccessToken = vi.mocked(refreshAccessToken);

const baseEnv = {
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:4000/api/youtube/oauth/callback",
  ENCRYPTION_KEY: "test-encryption-key-32-chars!!!",
};

const baseChannelRow = {
  id: "yt-channel-1",
  userId: "user-1",
  youtubeChannelId: "UC_test123",
  channelTitle: "Test Channel",
  channelThumbnailUrl: "https://example.com/thumb.jpg",
  refreshTokenEncrypted: "encrypted_token",
  scopes: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
  status: "CONNECTED" as const,
  lastVerifiedAt: new Date("2025-01-01T00:00:00.000Z"),
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

describe("youtube.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("buildOAuthUrl", () => {
    it("returns a valid Google OAuth URL with all required params", () => {
      const url = youtubeService.buildOAuthUrl(baseEnv, "http://localhost:4000/callback");
      expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain("client_id=test-client-id");
      expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fcallback");
      expect(url).toContain("response_type=code");
      expect(url).toContain("scope=");
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
    });

    it("throws AppError when GOOGLE_CLIENT_ID is missing", () => {
      const envNoClient = { ...baseEnv, GOOGLE_CLIENT_ID: "" };
      expect(() => youtubeService.buildOAuthUrl(envNoClient, "http://localhost:4000/callback")).toThrow(
        expect.objectContaining({ statusCode: 503, code: "GOOGLE_OAUTH_UNAVAILABLE" }),
      );
    });

    it("includes state param when provided", () => {
      const url = youtubeService.buildOAuthUrl(baseEnv, "http://localhost:4000/callback", "csrf-state");
      expect(url).toContain("state=csrf-state");
    });
  });

  describe("getYouTubeConnectionByUserId", () => {
    it("returns channel info when connection exists", async () => {
      mockFindUnique.mockResolvedValue(baseChannelRow);
      const result = await youtubeService.getYouTubeConnectionByUserId("user-1");
      expect(result.status).toBe("connected");
      expect(result.channelId).toBe("UC_test123");
      expect(result.channelTitle).toBe("Test Channel");
      expect(result.channelThumbnailUrl).toBe("https://example.com/thumb.jpg");
      expect(result.connectedAt).toBe("2025-01-01T00:00:00.000Z");
    });

    it("returns disconnected stub when no channel exists", async () => {
      mockFindUnique.mockResolvedValue(null);
      const result = await youtubeService.getYouTubeConnectionByUserId("user-1");
      expect(result.status).toBe("disconnected");
      expect(result.channelId).toBeNull();
      expect(result.channelTitle).toBeNull();
      expect(result.channelThumbnailUrl).toBeNull();
      expect(result.connectedAt).toBeNull();
    });

    it("maps NEEDS_REAUTH status correctly", async () => {
      mockFindUnique.mockResolvedValue({ ...baseChannelRow, status: "NEEDS_REAUTH" });
      const result = await youtubeService.getYouTubeConnectionByUserId("user-1");
      expect(result.status).toBe("needs_reauth");
    });

    it("maps DISCONNECTED status correctly", async () => {
      mockFindUnique.mockResolvedValue({ ...baseChannelRow, status: "DISCONNECTED" });
      const result = await youtubeService.getYouTubeConnectionByUserId("user-1");
      expect(result.status).toBe("disconnected");
    });
  });

  describe("disconnectYouTubeChannel", () => {
    it("sets the channel status to DISCONNECTED instead of deleting", async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });
      await youtubeService.disconnectYouTubeChannel("user-1");
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { status: "DISCONNECTED" },
      });
    });

    it("succeeds even if no channel exists", async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });
      await expect(youtubeService.disconnectYouTubeChannel("user-1")).resolves.not.toThrow();
    });
  });

  describe("connectYouTubeChannel", () => {
    const mockTokenResponse = {
      access_token: "test-access-token",
      expires_in: 3600,
      refresh_token: "test-refresh-token",
    };

    it("exchanges code, fetches channel info, and stores connection", async () => {
      // Mock token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });
      // Mock channels list (fetches channel ID, title, thumbnail in one call)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: "UC_new456",
                snippet: {
                  title: "New Channel",
                  thumbnails: { default: { url: "https://example.com/new-thumb.jpg" } },
                },
                contentDetails: { relatedPlaylists: { uploads: "uuu" } },
              },
            ],
          }),
      });

      mockUpsert.mockResolvedValue({
        ...baseChannelRow,
        youtubeChannelId: "UC_new456",
        channelTitle: "New Channel",
        channelThumbnailUrl: "https://example.com/new-thumb.jpg",
      });

      const result = await youtubeService.connectYouTubeChannel("user-1", "auth-code-123", baseEnv);

      expect(mockFetch).toHaveBeenCalledTimes(2); // token exchange + YouTube channels API
      expect(mockEncrypt).toHaveBeenCalledWith("test-refresh-token", baseEnv.ENCRYPTION_KEY);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          update: expect.objectContaining({
            youtubeChannelId: "UC_new456",
            channelTitle: "New Channel",
            status: "CONNECTED",
          }),
        }),
      );

      expect(result?.connection.channelId).toBe("UC_new456");
      expect(result?.connection.status).toBe("connected");
    });

    it("throws AppError on token exchange failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error_description: "invalid_grant" }),
      });

      await expect(
        youtubeService.connectYouTubeChannel("user-1", "bad-code", baseEnv),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "OAUTH_TOKEN_EXCHANGE_FAILED",
      });
    });

    it("throws AppError when YouTube API call fails", async () => {
      // Mock token exchange success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });
      // Mock channels API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
        json: () => Promise.resolve({}),
      });

      await expect(
        youtubeService.connectYouTubeChannel("user-1", "auth-code-123", baseEnv),
      ).rejects.toMatchObject({
        statusCode: 502,
        code: "YOUTUBE_API_ERROR",
      });
    });
  });

  describe("refreshAccessToken", () => {
    it("returns new access token on success", async () => {
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: "new-access-token",
        expiresAt: new Date(),
      });

      const result = await youtubeService.refreshAccessToken(baseChannelRow, baseEnv);

      expect(result.accessToken).toBe("new-access-token");
      expect(result.expiresAt instanceof Date).toBe(true);
      expect(mockRefreshAccessToken).toHaveBeenCalledWith(
        prisma,
        baseChannelRow,
        baseEnv,
      );
    });

    it("translates CHANNEL_NEEDS_REAUTH into the legacy AppError shape", async () => {
      mockRefreshAccessToken.mockRejectedValue(
        new PermanentPublishError(
          "CHANNEL_NEEDS_REAUTH",
          "refresh token no longer valid",
          400,
        ),
      );

      await expect(
        youtubeService.refreshAccessToken(baseChannelRow, baseEnv),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: "YOUTUBE_TOKEN_REFRESH_FAILED",
      });
      // The package itself marks NEEDS_REAUTH; the API wrapper doesn't
      // need to do it again.
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
