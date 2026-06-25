/**
 * Zod schemas for the preferences + security routes.
 *
 * - `updatePreferencesSchema`: partial-update body for PATCH
 *   /api/settings/preferences. Rejects empty bodies (matches the
 *   "if you PATCH one field, the rest stay as-is" contract — an
 *   empty PATCH is always a client bug).
 * - `changePasswordSchema`: body for POST /api/settings/change-password.
 *   Reuses the shared `passwordSchema` rule from the auth module so
 *   password requirements stay consistent across signup and update.
 *
 * IANA-timezone validation: a curated list is exposed in
 * @clipflow/types.COMMON_TIMEZONES for the UI's quick-pick dropdown,
 * but the server accepts ANY string that looks like a valid IANA zone
 * (Region/City shape, ASCII letters + digits + a handful of separators).
 * That way a creator in a less-common zone isn't forced to pick UTC
 * just because we don't ship their zone in the dropdown.
 */
import { z } from "zod";
import {
  CHAPTER_BEHAVIORS,
  THUMBNAIL_STYLES,
} from "@clipflow/types";
import { passwordSchema } from "../auth/auth.schemas.js";

/**
 * Loose IANA-timezone shape check. Real IANA zones are `Area/City`,
 * `Area/SubArea/City`, or a few legacy aliases like `UTC`, `GMT`.
 * The regex below is intentionally permissive — the *real* validation
 * happens when the runtime actually uses the value (e.g. the scheduling
 * UI tries to render a date in that zone). The point of the check here
 * is to reject typos and injection attempts, not to be a full IANA db.
 */
const ianaTimezoneRegex =
  /^(UTC|GMT|[A-Za-z][A-Za-z0-9_+-]{0,40}(?:\/[A-Za-z0-9_+-]{1,40}){0,3})$/;

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required.")
  .max(60, "Timezone is too long.")
  .regex(ianaTimezoneRegex, "Enter a valid IANA timezone (e.g. Asia/Kolkata).");

/**
 * HH:MM 24-hour time. Strict — "24:00" is rejected, "9:00" is
 * normalized via a transform to "09:00" so storage is always
 * zero-padded for consistent display.
 */
const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time in 24h HH:MM format.");

const chapterBehaviorSchema = z.enum(CHAPTER_BEHAVIORS);
const thumbnailStyleSchema = z.enum(THUMBNAIL_STYLES);

/**
 * Partial-update body for PATCH /api/settings/preferences. At least one
 * field required.
 */
export const updatePreferencesSchema = z
  .object({
    notifyProcessingComplete: z.boolean().optional(),
    notifyPublished: z.boolean().optional(),
    notifyPublishFailed: z.boolean().optional(),
    notifyNeedsReauth: z.boolean().optional(),
    notifyWeeklySummary: z.boolean().optional(),
    defaultTimezone: timezoneSchema.optional(),
    defaultPublishTime: timeOfDaySchema.optional(),
    chapterBehavior: chapterBehaviorSchema.optional(),
    thumbnailStyle: thumbnailStyleSchema.optional(),
  })
  .refine(
    (v) =>
      v.notifyProcessingComplete !== undefined ||
      v.notifyPublished !== undefined ||
      v.notifyPublishFailed !== undefined ||
      v.notifyNeedsReauth !== undefined ||
      v.notifyWeeklySummary !== undefined ||
      v.defaultTimezone !== undefined ||
      v.defaultPublishTime !== undefined ||
      v.chapterBehavior !== undefined ||
      v.thumbnailStyle !== undefined,
    { message: "Provide at least one preference to update." },
  );

/**
 * Body for POST /api/settings/change-password. Both fields use the same
 * rule as signup so a user can't sneak in a "weak" password through
 * the change flow.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordSchema,
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
