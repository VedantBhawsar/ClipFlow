import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "@clipflow/config";
import { AppError } from "../../errors/AppError.js";
import * as authService from "./auth.service.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    userProfile: {
      findUnique: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../lib/password.js", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_password"),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/jwt.js", () => ({
  signJwt: vi.fn().mockReturnValue("mock.jwt.token"),
}));

vi.mock("../../lib/db-guard.js", () => ({
  requireDatabase: vi.fn(),
}));

import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signJwt } from "../../lib/jwt.js";

const mockEnv: Env = {
  NODE_ENV: "test",
  PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://localhost:5432/test",
  REDIS_URL: undefined,
  JWT_SECRET: "super-secret-key-that-is-at-least-32-chars",
  JWT_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_IN: "7d",
  ENCRYPTION_KEY: "super-secret-encryption-key-32chars",
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  GOOGLE_REDIRECT_URI: undefined,
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 100,
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "clipflow-videos",
  S3_FORCE_PATH_STYLE: true,
  BULLMQ_PREFIX: "clipflow",
  YOUTUBE_CATEGORY_DEFAULT: "22",
  YOUTUBE_MAX_VIDEO_BYTES: 5 * 1024 * 1024 * 1024,
  YOUTUBE_PRESIGNED_POST_TTL: 900,
  FFMPEG_PATH: "ffmpeg",
  // v1.5 pipeline slice — not exercised by auth tests but the typed
  // `Env` requires them to be present (or undefined for optional fields).
  ASSEMBLYAI_API_KEY: undefined,
  LLM_PROVIDER: "claude",
  ANTHROPIC_API_KEY: undefined,
  OPENAI_API_KEY: undefined,
  NVIDIA_API_KEY: undefined,
  NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1",
  LLM_MODEL: "claude-3-5-haiku-latest",
  TRANSCRIBE_POLL_MS: 2000,
  TRANSCRIBE_TIMEOUT_MS: 15 * 60_000,
  SMTP_HOST: undefined,
  SMTP_PORT: 587,
  SMTP_USER: undefined,
  SMTP_PASS: undefined,
  SMTP_FROM: "ClipFlow <noreply@clipflow.app>",
  IMAGE_GEN_PROVIDER: "gemini",
  GEMINI_API_KEY: "test-gemini-key-min-20-chars",
  GEMINI_IMAGE_MODEL: "gemini-2.0-flash-exp-image-generation",
  GEMINI_VISION_MODEL: "gemini-2.0-flash-001",
  REPLICATE_API_TOKEN: undefined,
  REPLICATE_IMAGE_MODEL: "black-forest-labs/flux-pro",
  THUMBNAILS_PER_VIDEO: 5,
  THUMBNAIL_VISION_ENABLED: true,
};

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  passwordHash: "hashed_password",
  authProvider: "EMAIL" as const,
  googleId: null,
  emailVerifiedAt: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

describe("auth.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: refreshToken.create returns the row. The lib only uses the
    // return for `expiresAt` (which we already set internally); tests that
    // care override this.
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never);
  });

  describe("register", () => {
    it("creates a new user and returns access + refresh tokens", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      const result = await authService.register(
        { email: "test@example.com", password: "Password123" },
        mockEnv,
      );

      expect(result.user).toEqual({
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        authProvider: "EMAIL",
        emailVerifiedAt: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      });
      expect(result.accessToken).toBe("mock.jwt.token");
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.refreshToken.length).toBeGreaterThan(20);
      expect(result.accessTokenExpiresAt).toEqual(expect.any(Number));
      expect(result.refreshTokenExpiresAt).toEqual(expect.any(Number));
      expect(result.accessTokenExpiresAt).toBeLessThan(
        result.refreshTokenExpiresAt,
      );

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(hashPassword).toHaveBeenCalledWith("Password123");
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "test@example.com",
          passwordHash: "hashed_password",
          name: null,
          authProvider: "EMAIL",
        },
      });
      expect(signJwt).toHaveBeenCalledWith(
        { sub: "user-123", email: "test@example.com" },
        mockEnv,
      );
      // A refresh-token row is created in the same family-less call.
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it("creates user with name when provided", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        ...mockUser,
        name: "John Doe",
      });

      const result = await authService.register(
        { email: "test@example.com", password: "Password123", name: "John Doe" },
        mockEnv,
      );

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "test@example.com",
          passwordHash: "hashed_password",
          name: "John Doe",
          authProvider: "EMAIL",
        },
      });
      expect(result.user.name).toBe("John Doe");
    });

    it("throws EMAIL_TAKEN when user already exists", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);

      await expect(
        authService.register(
          { email: "test@example.com", password: "Password123" },
          mockEnv,
        ),
      ).rejects.toThrow(AppError);
      await expect(
        authService.register(
          { email: "test@example.com", password: "Password123" },
          mockEnv,
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "EMAIL_TAKEN",
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("returns access + refresh tokens for valid credentials", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValue({
        displayName: null,
        onboardingCompletedAt: null,
      } as never);
      vi.mocked(verifyPassword).mockResolvedValue(true);

      const result = await authService.login(
        { email: "test@example.com", password: "Password123" },
        mockEnv,
      );

      expect(result.user.email).toBe("test@example.com");
      expect(result.accessToken).toBe("mock.jwt.token");
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.onboardingCompleted).toBe(false);
      expect(result.displayName).toBeNull();
      expect(verifyPassword).toHaveBeenCalledWith("Password123", "hashed_password");
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it("throws INVALID_CREDENTIALS when user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(
        authService.login(
          { email: "notfound@example.com", password: "Password123" },
          mockEnv,
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it("throws INVALID_CREDENTIALS when password does not match", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(verifyPassword).mockResolvedValue(false);

      await expect(
        authService.login(
          { email: "test@example.com", password: "WrongPassword" },
          mockEnv,
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it("throws INVALID_CREDENTIALS when user has no password (OAuth user)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        passwordHash: null,
      });

      await expect(
        authService.login(
          { email: "test@example.com", password: "Password123" },
          mockEnv,
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("is a no-op when no refreshToken is provided", async () => {
      await expect(authService.logout(undefined)).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("is a no-op when refreshToken is absent from body", async () => {
      await expect(authService.logout({})).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("googleSignIn", () => {
    it("throws NOT_IMPLEMENTED", async () => {
      await expect(
        authService.googleSignIn("some-id-token"),
      ).rejects.toMatchObject({
        statusCode: 501,
        code: "NOT_IMPLEMENTED",
      });
    });
  });
});