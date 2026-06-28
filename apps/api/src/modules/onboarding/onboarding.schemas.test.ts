import { describe, it, expect } from "vitest";
import {
  updateProfileSchema,
  patchProfileSchema,
} from "./onboarding.schemas.js";

describe("onboarding.schemas", () => {
  describe("updateProfileSchema", () => {
    it("accepts valid full profile update", () => {
      const result = updateProfileSchema.safeParse({
        niche: "GAMING",
        uploadFrequency: "ONE_TO_FOUR",
        primaryGoal: "GROW_VIEWS",
      });
      expect(result.success).toBe(true);
    });

    it("accepts profile with optional displayName", () => {
      const result = updateProfileSchema.safeParse({
        displayName: "My Channel",
        niche: "GAMING",
        uploadFrequency: "ONE_TO_FOUR",
        primaryGoal: "GROW_VIEWS",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      const result = updateProfileSchema.safeParse({
        niche: "GAMING",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid niche value", () => {
      const result = updateProfileSchema.safeParse({
        niche: "INVALID_NICHE",
        uploadFrequency: "ONE_TO_FOUR",
        primaryGoal: "GROW_VIEWS",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid uploadFrequency value", () => {
      const result = updateProfileSchema.safeParse({
        niche: "GAMING",
        uploadFrequency: "INVALID_FREQ",
        primaryGoal: "GROW_VIEWS",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid primaryGoal value", () => {
      const result = updateProfileSchema.safeParse({
        niche: "GAMING",
        uploadFrequency: "ONE_TO_FOUR",
        primaryGoal: "INVALID_GOAL",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty displayName string", () => {
      const result = updateProfileSchema.safeParse({
        displayName: "",
        niche: "GAMING",
        uploadFrequency: "ONE_TO_FOUR",
        primaryGoal: "GROW_VIEWS",
      });
      expect(result.success).toBe(false);
    });

    it("trims and accepts valid displayName", () => {
      const result = updateProfileSchema.safeParse({
        displayName: "  My Channel  ",
        niche: "GAMING",
        uploadFrequency: "ONE_TO_FOUR",
        primaryGoal: "GROW_VIEWS",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBe("My Channel");
      }
    });
  });

  describe("patchProfileSchema", () => {
    it("accepts single field update", () => {
      const result = patchProfileSchema.safeParse({
        displayName: "My Channel",
      });
      expect(result.success).toBe(true);
    });

    it("accepts multiple field updates", () => {
      const result = patchProfileSchema.safeParse({
        niche: "TECH_EDUCATION",
        uploadFrequency: "FIVE_TO_TEN",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all optional fields", () => {
      const result = patchProfileSchema.safeParse({
        displayName: "My Channel",
        niche: "GAMING",
        uploadFrequency: "ONE_TO_FOUR",
        primaryGoal: "GROW_VIEWS",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty object", () => {
      const result = patchProfileSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Provide at least one field to update.",
        );
      }
    });

    it("rejects invalid niche value", () => {
      const result = patchProfileSchema.safeParse({
        niche: "INVALID_NICHE",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid uploadFrequency value", () => {
      const result = patchProfileSchema.safeParse({
        uploadFrequency: "INVALID_FREQ",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid primaryGoal value", () => {
      const result = patchProfileSchema.safeParse({
        primaryGoal: "INVALID_GOAL",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty string displayName", () => {
      const result = patchProfileSchema.safeParse({
        displayName: "",
      });
      expect(result.success).toBe(false);
    });
  });
});
