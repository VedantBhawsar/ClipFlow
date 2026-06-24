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
  JWT_EXPIRES_IN: "7d",
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
  });

  describe("register", () => {
    it("creates a new user and returns auth response", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

      const result = await authService.register(
        { email: "test@example.com", password: "Password123" },
        mockEnv,
      );

      expect(result).toEqual({
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          authProvider: "EMAIL",
          emailVerifiedAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        token: "mock.jwt.token",
      });
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
    });
  });

  describe("login", () => {
    it("returns auth response for valid credentials", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(verifyPassword).mockResolvedValue(true);

      const result = await authService.login(
        { email: "test@example.com", password: "Password123" },
        mockEnv,
      );

      expect(result).toEqual({
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          authProvider: "EMAIL",
          emailVerifiedAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        token: "mock.jwt.token",
      });
      expect(verifyPassword).toHaveBeenCalledWith("Password123", "hashed_password");
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
    });
  });

  describe("logout", () => {
    it("always returns undefined (stateless JWT)", async () => {
      const result = await authService.logout();
      expect(result).toBeUndefined();
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

  describe("me", () => {
    const mockUserWithProfile = {
      ...mockUser,
      profile: {
        id: "profile-123",
        displayName: "My Channel",
        niche: "GAMING",
        uploadFrequency: "ONE_TO_FOUR",
        primaryGoal: "GROW_VIEWS",
        recommendedPlanId: "starter",
        onboardingCompletedAt: new Date("2024-01-15"),
      },
    };

    it("returns user with profile and onboardingCompleted=true when profile exists", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUserWithProfile);

      const result = await authService.me("user-123");

      expect(result).toEqual({
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          authProvider: "EMAIL",
          emailVerifiedAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        profile: {
          id: "profile-123",
          displayName: "My Channel",
          niche: "GAMING",
          uploadFrequency: "ONE_TO_FOUR",
          primaryGoal: "GROW_VIEWS",
          recommendedPlanId: "starter",
          onboardingCompletedAt: "2024-01-15T00:00:00.000Z",
        },
        onboardingCompleted: true,
      });
    });

    it("returns user with null profile and onboardingCompleted=false when no profile", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        profile: null,
      });

      const result = await authService.me("user-123");

      expect(result.profile).toBeNull();
      expect(result.onboardingCompleted).toBe(false);
    });

    it("throws UNAUTHENTICATED when user not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(authService.me("deleted-user")).rejects.toMatchObject({
        statusCode: 401,
        code: "UNAUTHENTICATED",
      });
    });
  });
});
