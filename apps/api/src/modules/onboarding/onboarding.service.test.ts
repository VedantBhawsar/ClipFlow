import { describe, it, expect, vi, beforeEach } from "vitest";
import * as onboardingService from "./onboarding.service.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    userProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../lib/db-guard.js", () => ({
  requireDatabase: vi.fn(),
}));

vi.mock("./plan-recommendation.js", () => ({
  recommendPlan: vi.fn().mockReturnValue("starter"),
}));

import { prisma } from "../../lib/prisma.js";
import { recommendPlan } from "./plan-recommendation.js";

const mockProfile = {
  id: "profile-123",
  userId: "user-123",
  displayName: "My Channel",
  niche: "GAMING",
  uploadFrequency: "ONE_TO_FOUR",
  primaryGoal: "GROW_VIEWS",
  recommendedPlanId: "starter",
  onboardingCompletedAt: new Date("2024-01-15"),
};

describe("onboarding.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recommendPlan).mockReturnValue("starter");
  });

  describe("getStatus", () => {
    it("returns completed=true when onboardingCompletedAt is set", async () => {
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

      const result = await onboardingService.getStatus("user-123");

      expect(result).toEqual({
        completed: true,
        profile: {
          id: "profile-123",
          displayName: "My Channel",
          niche: "GAMING",
          uploadFrequency: "ONE_TO_FOUR",
          primaryGoal: "GROW_VIEWS",
          recommendedPlanId: "starter",
          onboardingCompletedAt: "2024-01-15T00:00:00.000Z",
        },
      });
    });

    it("returns completed=false when profile has no onboardingCompletedAt", async () => {
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValue({
        ...mockProfile,
        onboardingCompletedAt: null,
      });

      const result = await onboardingService.getStatus("user-123");

      expect(result.completed).toBe(false);
      expect(result.profile).not.toBeNull();
    });

    it("returns completed=false and null profile when no profile exists", async () => {
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null);

      const result = await onboardingService.getStatus("user-123");

      expect(result).toEqual({
        completed: false,
        profile: null,
      });
    });
  });

  describe("updateProfile", () => {
    const validInput = {
      niche: "GAMING" as const,
      uploadFrequency: "ONE_TO_FOUR" as const,
      primaryGoal: "GROW_VIEWS" as const,
    };

    it("creates profile if it does not exist", async () => {
      vi.mocked(prisma.userProfile.upsert).mockResolvedValue({
        ...mockProfile,
        displayName: null,
        onboardingCompletedAt: new Date(),
      });

      const result = await onboardingService.updateProfile("user-123", validInput);

      expect(prisma.userProfile.upsert).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        create: {
          userId: "user-123",
          displayName: null,
          niche: "GAMING",
          uploadFrequency: "ONE_TO_FOUR",
          primaryGoal: "GROW_VIEWS",
          recommendedPlanId: "starter",
          onboardingCompletedAt: expect.any(Date),
        },
        update: {
          displayName: null,
          niche: "GAMING",
          uploadFrequency: "ONE_TO_FOUR",
          primaryGoal: "GROW_VIEWS",
          recommendedPlanId: "starter",
          onboardingCompletedAt: expect.any(Date),
        },
      });
      expect(result.niche).toBe("GAMING");
      expect(result.uploadFrequency).toBe("ONE_TO_FOUR");
    });

    it("updates existing profile", async () => {
      vi.mocked(prisma.userProfile.upsert).mockResolvedValue(mockProfile);

      await onboardingService.updateProfile("user-123", validInput);

      expect(prisma.userProfile.upsert).toHaveBeenCalled();
    });

    it("sets displayName when provided", async () => {
      const inputWithName = {
        ...validInput,
        displayName: "My Awesome Channel",
      };
      vi.mocked(prisma.userProfile.upsert).mockResolvedValue({
        ...mockProfile,
        displayName: "My Awesome Channel",
      });

      const result = await onboardingService.updateProfile("user-123", inputWithName);

      expect(result.displayName).toBe("My Awesome Channel");
    });

    it("recommends plan based on upload frequency", async () => {
      vi.mocked(recommendPlan).mockReturnValue("creator");
      vi.mocked(prisma.userProfile.upsert).mockResolvedValue({
        ...mockProfile,
        recommendedPlanId: "creator",
        uploadFrequency: "FIVE_TO_TEN",
      });

      await onboardingService.updateProfile("user-123", {
        ...validInput,
        uploadFrequency: "FIVE_TO_TEN",
      });

      expect(recommendPlan).toHaveBeenCalledWith("FIVE_TO_TEN");
    });
  });

  describe("patchProfile", () => {
    it("updates only provided fields", async () => {
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);
      vi.mocked(prisma.userProfile.update).mockResolvedValue({
        ...mockProfile,
        displayName: "New Name",
      });

      const result = await onboardingService.patchProfile("user-123", {
        displayName: "New Name",
      });

      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        data: { displayName: "New Name" },
      });
      expect(result.displayName).toBe("New Name");
    });

    it("recomputes recommendedPlanId when uploadFrequency changes", async () => {
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);
      vi.mocked(recommendPlan).mockReturnValue("creator");
      vi.mocked(prisma.userProfile.update).mockResolvedValue({
        ...mockProfile,
        uploadFrequency: "FIVE_TO_TEN",
        recommendedPlanId: "creator",
      });

      await onboardingService.patchProfile("user-123", {
        uploadFrequency: "FIVE_TO_TEN",
      });

      expect(recommendPlan).toHaveBeenCalledWith("FIVE_TO_TEN");
      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { userId: "user-123" },
        data: {
          uploadFrequency: "FIVE_TO_TEN",
          recommendedPlanId: "creator",
        },
      });
    });

    it("throws PROFILE_NOT_FOUND when no profile exists", async () => {
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null);

      await expect(
        onboardingService.patchProfile("user-123", { niche: "TECH_EDUCATION" }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "PROFILE_NOT_FOUND",
      });
    });

    it("does not touch onboardingCompletedAt", async () => {
      vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);
      vi.mocked(prisma.userProfile.update).mockResolvedValue(mockProfile);

      await onboardingService.patchProfile("user-123", {
        displayName: "New Name",
      });

      const updateCall = vi.mocked(prisma.userProfile.update).mock.calls[0][0];
      expect(updateCall.data.onboardingCompletedAt).toBeUndefined();
    });
  });
});
