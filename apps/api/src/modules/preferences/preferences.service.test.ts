import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "../../errors/AppError.js";
import * as preferencesService from "./preferences.service.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    userPreferences: {
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../lib/password.js", () => ({
  hashPassword: vi.fn().mockResolvedValue("new_hash"),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/db-guard.js", () => ({
  requireDatabase: vi.fn(),
}));

import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";

const mockUpsert = vi.mocked(prisma.userPreferences.upsert);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockUserUpdate = vi.mocked(prisma.user.update);
const mockHash = vi.mocked(hashPassword);
const mockVerify = vi.mocked(verifyPassword);

// `as const` so the chapterBehavior / thumbnailStyle fields are the
// enum literal types Prisma expects (not plain `string`).
const baseRow = {
  id: "pref-1",
  userId: "user-1",
  notifyProcessingComplete: true,
  notifyPublished: true,
  notifyPublishFailed: true,
  notifyNeedsReauth: true,
  notifyWeeklySummary: false,
  defaultTimezone: "UTC",
  defaultPublishTime: "18:00",
  chapterBehavior: "ALWAYS_REVIEW" as const,
  thumbnailStyle: "AUTO" as const,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

const baseUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  passwordHash: "old_hash" as string | null,
  authProvider: "EMAIL" as const,
  googleId: null,
  emailVerifiedAt: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

describe("preferences.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPreferences", () => {
    it("returns DTO from existing row (no create when row exists)", async () => {
      mockUpsert.mockResolvedValue(baseRow);
      const result = await preferencesService.getPreferences("user-1");
      expect(result.id).toBe("pref-1");
      expect(result.defaultTimezone).toBe("UTC");
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        create: { userId: "user-1" },
        update: {},
      });
    });

    it("materializes a default row on first read", async () => {
      const freshRow = { ...baseRow, id: "pref-new", defaultTimezone: "UTC" };
      mockUpsert.mockResolvedValue(freshRow);
      const result = await preferencesService.getPreferences("user-1");
      expect(result.id).toBe("pref-new");
    });
  });

  describe("updatePreferences", () => {
    it("passes only the supplied field to prisma update", async () => {
      mockUpsert.mockResolvedValue({
        ...baseRow,
        notifyPublished: false,
        updatedAt: new Date("2025-02-01T00:00:00.000Z"),
      });
      await preferencesService.updatePreferences("user-1", {
        notifyPublished: false,
      });
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        create: { userId: "user-1", notifyPublished: false },
        update: { notifyPublished: false },
      });
    });

    it("supports multiple fields at once", async () => {
      mockUpsert.mockResolvedValue({
        ...baseRow,
        defaultTimezone: "Asia/Kolkata",
        chapterBehavior: "AUTO_APPLY_IF_VALID" as const,
        updatedAt: new Date("2025-02-01T00:00:00.000Z"),
      });
      await preferencesService.updatePreferences("user-1", {
        defaultTimezone: "Asia/Kolkata",
        chapterBehavior: "AUTO_APPLY_IF_VALID",
      });
      const call = mockUpsert.mock.calls[0]?.[0];
      expect(call?.update).toEqual({
        defaultTimezone: "Asia/Kolkata",
        chapterBehavior: "AUTO_APPLY_IF_VALID",
      });
    });
  });

  describe("changePassword", () => {
    it("hashes the new password and updates the user row on success", async () => {
      mockUserFindUnique.mockResolvedValue(baseUser);
      mockHash.mockResolvedValue("new_hash");
      mockUserUpdate.mockResolvedValue(baseUser);
      await expect(
        preferencesService.changePassword("user-1", {
          currentPassword: "OldPass123",
          newPassword: "NewPass456",
        }),
      ).resolves.toBeUndefined();
      expect(mockVerify).toHaveBeenCalledWith("OldPass123", "old_hash");
      expect(mockHash).toHaveBeenCalledWith("NewPass456");
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { passwordHash: "new_hash" },
      });
    });

    it("rejects with 401 INVALID_CREDENTIALS on wrong current password", async () => {
      mockUserFindUnique.mockResolvedValue(baseUser);
      mockVerify.mockResolvedValue(false);
      await expect(
        preferencesService.changePassword("user-1", {
          currentPassword: "wrong",
          newPassword: "NewPass456",
        }),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
      });
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("rejects Google-only accounts (no passwordHash) with 400 PASSWORD_NOT_SET", async () => {
      mockUserFindUnique.mockResolvedValue({ ...baseUser, passwordHash: null });
      await expect(
        preferencesService.changePassword("user-1", {
          currentPassword: "anything",
          newPassword: "NewPass456",
        }),
      ).rejects.toBeInstanceOf(AppError);
      try {
        await preferencesService.changePassword("user-1", {
          currentPassword: "anything",
          newPassword: "NewPass456",
        });
      } catch (err) {
        expect(err).toMatchObject({
          statusCode: 400,
          code: "PASSWORD_NOT_SET",
        });
      }
    });

    it("throws 401 if the user row is gone", async () => {
      mockUserFindUnique.mockResolvedValue(null);
      await expect(
        preferencesService.changePassword("user-1", {
          currentPassword: "OldPass123",
          newPassword: "NewPass456",
        }),
      ).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHENTICATED" });
    });
  });
});