/**
 * Onboarding service.
 *
 * Owns the read/write logic for `UserProfile` rows. Both `POST` (full
 * update + complete) and `PATCH` (partial update) live here so the
 * controller stays thin.
 */
import type { OnboardingStatusResponse, UserProfile } from "@clipflow/types";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import type { PatchProfileInput, UpdateProfileInput } from "./onboarding.schemas.js";
import { recommendPlan } from "./plan-recommendation.js";

/**
 * Map a Prisma `UserProfile` row to the wire-format DTO.
 *
 * @param p Prisma row.
 * @returns DTO suitable for `MeResponse.profile`, `OnboardingStatusResponse.profile`, etc.
 */
const toProfileDto = (p: {
  id: string;
  displayName: string | null;
  niche: string | null;
  uploadFrequency: string | null;
  primaryGoal: string | null;
  recommendedPlanId: string | null;
  onboardingCompletedAt: Date | null;
}): UserProfile => {
  return {
    id: p.id,
    displayName: p.displayName,
    niche: p.niche as UserProfile["niche"],
    uploadFrequency: p.uploadFrequency as UserProfile["uploadFrequency"],
    primaryGoal: p.primaryGoal as UserProfile["primaryGoal"],
    recommendedPlanId: p.recommendedPlanId,
    onboardingCompletedAt: p.onboardingCompletedAt?.toISOString() ?? null,
  };
};

/**
 * Fetch the current onboarding status for a user.
 *
 * @param userId Authenticated user id.
 * @returns `OnboardingStatusResponse`.
 */
export const getStatus = async (userId: string): Promise<OnboardingStatusResponse> => {
  requireDatabase();
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  return {
    completed: profile?.onboardingCompletedAt != null,
    profile: profile ? toProfileDto(profile) : null,
  };
};

/**
 * Full profile update (POST). Creates the profile if missing, updates
 * all required fields, sets `onboardingCompletedAt = now()`, and computes
 * `recommendedPlanId` from the supplied `uploadFrequency`.
 *
 * @param userId Authenticated user id.
 * @param input Validated input.
 * @returns Updated `UserProfile`.
 */
export const updateProfile = async (
  userId: string,
  input: UpdateProfileInput,
): Promise<UserProfile> => {
  requireDatabase();
  const recommendedPlanId = recommendPlan(input.uploadFrequency);

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      displayName: input.displayName ?? null,
      niche: input.niche,
      uploadFrequency: input.uploadFrequency,
      primaryGoal: input.primaryGoal,
      recommendedPlanId,
      onboardingCompletedAt: new Date(),
    },
    update: {
      displayName: input.displayName ?? null,
      niche: input.niche,
      uploadFrequency: input.uploadFrequency,
      primaryGoal: input.primaryGoal,
      recommendedPlanId,
      onboardingCompletedAt: new Date(),
    },
  });

  return toProfileDto(profile);
};

/**
 * Partial profile update (PATCH). Updates only the fields that were
 * supplied. Does NOT set `onboardingCompletedAt`. If `uploadFrequency`
 * changes, recompute `recommendedPlanId` to match.
 *
 * @param userId Authenticated user id.
 * @param input Validated input (at least one field).
 * @returns Updated `UserProfile`.
 * @throws AppError(404) if no profile row exists yet (user should POST first).
 */
export const patchProfile = async (
  userId: string,
  input: PatchProfileInput,
): Promise<UserProfile> => {
  requireDatabase();
  const existing = await prisma.userProfile.findUnique({ where: { userId } });
  if (!existing) {
    throw new AppError(
      404,
      "PROFILE_NOT_FOUND",
      "No profile exists to patch — submit onboarding first.",
    );
  }

  const data: {
    displayName?: string | null;
    niche?: typeof input.niche;
    uploadFrequency?: typeof input.uploadFrequency;
    primaryGoal?: typeof input.primaryGoal;
    recommendedPlanId?: string;
  } = {};

  if (input.displayName !== undefined) {
    data.displayName = input.displayName;
  }
  if (input.niche !== undefined) {
    data.niche = input.niche;
  }
  if (input.uploadFrequency !== undefined) {
    data.uploadFrequency = input.uploadFrequency;
    data.recommendedPlanId = recommendPlan(input.uploadFrequency);
  }
  if (input.primaryGoal !== undefined) {
    data.primaryGoal = input.primaryGoal;
  }

  const profile = await prisma.userProfile.update({
    where: { userId },
    data,
  });

  return toProfileDto(profile);
};
