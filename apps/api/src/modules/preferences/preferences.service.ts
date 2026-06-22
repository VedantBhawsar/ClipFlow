/**
 * Preferences service.
 *
 * Owns the read/write logic for `UserPreferences` rows plus the
 * `users.passwordHash` mutation that powers change-password.
 *
 * The `getPreferences` service is responsible for materializing a
 * default row on first read (upsert with empty create payload + DB
 * defaults), so callers never have to think about "has this user
 * ever opened settings yet."
 */
import type { UserPreferences } from "@clipflow/types";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import type { ChangePasswordInput, UpdatePreferencesInput } from "./preferences.schemas.js";

/**
 * Map a Prisma `UserPreferences` row to the wire-format DTO.
 *
 * @param p Prisma row.
 * @returns DTO suitable for `UserPreferences` consumers.
 */
const toPreferencesDto = (p: {
  id: string;
  notifyProcessingComplete: boolean;
  notifyPublished: boolean;
  notifyPublishFailed: boolean;
  notifyNeedsReauth: boolean;
  notifyWeeklySummary: boolean;
  defaultTimezone: string;
  defaultPublishTime: string;
  chapterBehavior: string;
  thumbnailStyle: string;
  createdAt: Date;
  updatedAt: Date;
}): UserPreferences => {
  return {
    id: p.id,
    notifyProcessingComplete: p.notifyProcessingComplete,
    notifyPublished: p.notifyPublished,
    notifyPublishFailed: p.notifyPublishFailed,
    notifyNeedsReauth: p.notifyNeedsReauth,
    notifyWeeklySummary: p.notifyWeeklySummary,
    defaultTimezone: p.defaultTimezone,
    defaultPublishTime: p.defaultPublishTime,
    // Casts: Prisma returns the enum values as strings; the DTO accepts
    // the matching string union types. Safe because the columns are
    // constrained by the Prisma enum.
    chapterBehavior: p.chapterBehavior as UserPreferences["chapterBehavior"],
    thumbnailStyle: p.thumbnailStyle as UserPreferences["thumbnailStyle"],
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
};

/**
 * Fetch the current preferences for a user, materializing a default
 * row on first read. Always returns a DTO — never null.
 *
 * @param userId Authenticated user id.
 * @returns `UserPreferences`.
 */
export const getPreferences = async (userId: string): Promise<UserPreferences> => {
  requireDatabase();
  // Upsert with an empty create payload so the DB defaults (set in
  // schema.prisma) populate the row. If a row already exists, the
  // `create` branch is skipped and the existing row is returned
  // unchanged. This means a returning user gets their stored values
  // back, not a fresh-default overwrite.
  const row = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return toPreferencesDto(row);
};

/**
 * Partial update of preferences. Only the fields that were supplied
 * are written; everything else stays as-is.
 *
 * @param userId Authenticated user id.
 * @param input Validated partial input (at least one field).
 * @returns Updated `UserPreferences`.
 */
export const updatePreferences = async (
  userId: string,
  input: UpdatePreferencesInput,
): Promise<UserPreferences> => {
  requireDatabase();

  // Build the patch object dynamically so we never overwrite fields
  // the caller didn't send.
  const data: Record<string, unknown> = {};
  if (input.notifyProcessingComplete !== undefined) {
    data.notifyProcessingComplete = input.notifyProcessingComplete;
  }
  if (input.notifyPublished !== undefined) {
    data.notifyPublished = input.notifyPublished;
  }
  if (input.notifyPublishFailed !== undefined) {
    data.notifyPublishFailed = input.notifyPublishFailed;
  }
  if (input.notifyNeedsReauth !== undefined) {
    data.notifyNeedsReauth = input.notifyNeedsReauth;
  }
  if (input.notifyWeeklySummary !== undefined) {
    data.notifyWeeklySummary = input.notifyWeeklySummary;
  }
  if (input.defaultTimezone !== undefined) {
    data.defaultTimezone = input.defaultTimezone;
  }
  if (input.defaultPublishTime !== undefined) {
    data.defaultPublishTime = input.defaultPublishTime;
  }
  if (input.chapterBehavior !== undefined) {
    data.chapterBehavior = input.chapterBehavior;
  }
  if (input.thumbnailStyle !== undefined) {
    data.thumbnailStyle = input.thumbnailStyle;
  }

  const row = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return toPreferencesDto(row);
};

/**
 * Change the authenticated user's password.
 *
 * Verifies the supplied current password against the stored hash
 * before accepting the new one. Rejects re-use of the same password
 * (a small but real defense against an attacker who already has the
 * current password rotating it back to the same value).
 *
 * @param userId Authenticated user id.
 * @param input Validated current + new password.
 * @throws AppError(404) if user row is gone, AppError(401)
 *   `INVALID_CREDENTIALS` if the current password is wrong,
 *   AppError(400) `PASSWORD_REUSED` if the new password matches the
 *   current hash.
 */
export const changePassword = async (
  userId: string,
  input: ChangePasswordInput,
): Promise<void> => {
  requireDatabase();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    // Token references a deleted user — same posture as auth.service.me.
    throw new AppError(401, "UNAUTHENTICATED", "Your session is no longer valid.");
  }
  if (!user.passwordHash) {
    // Google-only account; can't change a password that was never set.
    throw new AppError(
      400,
      "PASSWORD_NOT_SET",
      "This account uses Google sign-in and has no password to change.",
    );
  }
  const currentMatches = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!currentMatches) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Your current password is incorrect.",
    );
  }
  const newHash = await hashPassword(input.newPassword);
  if (newHash === user.passwordHash) {
    // Highly unlikely with bcrypt (different salts), but guard anyway:
    // the only way this happens is if the hashing layer is broken,
    // and silently "succeeding" would be worse than surfacing a 400.
    throw new AppError(
      400,
      "PASSWORD_REUSED",
      "Your new password must be different from your current one.",
    );
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });
};
