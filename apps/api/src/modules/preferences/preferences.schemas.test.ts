import { describe, it, expect } from "vitest";
import {
  changePasswordSchema,
  updatePreferencesSchema,
} from "./preferences.schemas.js";

describe("preferences.schemas", () => {
  describe("updatePreferencesSchema", () => {
    it("accepts a single field", () => {
      const result = updatePreferencesSchema.parse({
        notifyPublished: false,
      });
      expect(result.notifyPublished).toBe(false);
    });

    it("accepts a full payload", () => {
      const result = updatePreferencesSchema.parse({
        notifyProcessingComplete: true,
        notifyPublished: true,
        notifyPublishFailed: true,
        notifyNeedsReauth: true,
        notifyWeeklySummary: false,
        defaultTimezone: "Asia/Kolkata",
        defaultPublishTime: "18:00",
        chapterBehavior: "ALWAYS_REVIEW",
        thumbnailStyle: "AUTO",
      });
      expect(result.defaultTimezone).toBe("Asia/Kolkata");
      expect(result.chapterBehavior).toBe("ALWAYS_REVIEW");
    });

    it("rejects an empty body", () => {
      const result = updatePreferencesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects an unknown timezone shape", () => {
      const result = updatePreferencesSchema.safeParse({
        defaultTimezone: "not-a-timezone!!!",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a malformed time", () => {
      const result = updatePreferencesSchema.safeParse({
        defaultPublishTime: "25:00",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-enum chapterBehavior", () => {
      const result = updatePreferencesSchema.safeParse({
        chapterBehavior: "MAYBE",
      });
      expect(result.success).toBe(false);
    });

    it("trims a timezone string before validation", () => {
      const result = updatePreferencesSchema.parse({
        defaultTimezone: "  Asia/Kolkata  ",
      });
      expect(result.defaultTimezone).toBe("Asia/Kolkata");
    });

    it("accepts UTC as a valid timezone", () => {
      const result = updatePreferencesSchema.parse({
        defaultTimezone: "UTC",
      });
      expect(result.defaultTimezone).toBe("UTC");
    });
  });

  describe("changePasswordSchema", () => {
    it("accepts a valid current + new password pair", () => {
      const result = changePasswordSchema.parse({
        currentPassword: "OldPass123",
        newPassword: "NewPass456",
      });
      expect(result.currentPassword).toBe("OldPass123");
      expect(result.newPassword).toBe("NewPass456");
    });

    it("rejects a missing current password", () => {
      const result = changePasswordSchema.safeParse({
        newPassword: "NewPass456",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a new password that fails the strength rule", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "OldPass123",
        newPassword: "short",
      });
      expect(result.success).toBe(false);
    });
  });
});
