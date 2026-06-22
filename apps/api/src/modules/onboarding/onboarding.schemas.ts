/**
 * Zod schemas for onboarding routes.
 *
 * All four onboarding answers (`displayName`, `niche`, `uploadFrequency`,
 * `primaryGoal`) are valid here. The full-update endpoint requires three
 * of them; `displayName` is optional in both shapes.
 */
import { z } from "zod";
import {
  CONTENT_NICHES,
  PRIMARY_GOALS,
  UPLOAD_FREQUENCIES,
} from "@clipflow/types";

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name cannot be empty.")
  .max(60, "Display name must be at most 60 characters.");

const nicheSchema = z.enum(CONTENT_NICHES);
const uploadFrequencySchema = z.enum(UPLOAD_FREQUENCIES);
const primaryGoalSchema = z.enum(PRIMARY_GOALS);

/**
 * Full update body schema for `POST /api/onboarding/profile`. All four
 * fields required (displayName optional). On success, onboarding is
 * marked complete.
 */
export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional(),
  niche: nicheSchema,
  uploadFrequency: uploadFrequencySchema,
  primaryGoal: primaryGoalSchema,
});

/**
 * Partial update body schema for `PATCH /api/onboarding/profile`. Any of
 * the four fields optional; onboarding completion is NOT touched.
 */
export const patchProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    niche: nicheSchema.optional(),
    uploadFrequency: uploadFrequencySchema.optional(),
    primaryGoal: primaryGoalSchema.optional(),
  })
  .refine(
    (v) =>
      v.displayName !== undefined ||
      v.niche !== undefined ||
      v.uploadFrequency !== undefined ||
      v.primaryGoal !== undefined,
    { message: "Provide at least one field to update." },
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type PatchProfileInput = z.infer<typeof patchProfileSchema>;
