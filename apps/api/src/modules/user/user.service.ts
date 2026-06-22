/**
 * User-bundle service.
 *
 * Provides the combined "everything the dashboard chrome needs in one
 * call" read used by the web client on hydration. The same data shape
 * is also useful for any future server-side rendering pass.
 *
 * Each piece (user, profile, preferences) is fetched via the existing
 * service functions to keep logic in one place. The bundle is cached
 * as a single blob so partial writes can invalidate one key.
 */
import type {
  AuthUser,
  UserBundleResponse,
  UserPreferences,
  UserProfile,
  YouTubeConnection,
} from "@clipflow/types";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { getPreferences } from "../preferences/preferences.service.js";

/**
 * Stable YouTube-connection stub for v1.
 *
 * The real `YouTubeChannel` row is being added when the OAuth flow
 * ships (per docs/AppFlow.md Section 1). Until then, the settings
 * page needs a real read endpoint so the UI doesn't show a broken
 * state. The stub returns a single, deterministic "not connected"
 * shape — call sites can branch on `status === "disconnected"`.
 *
 * @returns Always-disconnected YouTube connection for v1.
 */
export const stubbedYouTubeConnection = (): YouTubeConnection => {
  return {
    status: "disconnected",
    channelId: null,
    channelTitle: null,
    channelThumbnailUrl: null,
    connectedAt: null,
    lastVerifiedAt: null,
  };
};

interface UserBundleRow {
  id: string;
  email: string;
  name: string | null;
  authProvider: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  profile: {
    id: string;
    displayName: string | null;
    niche: string | null;
    uploadFrequency: string | null;
    primaryGoal: string | null;
    recommendedPlanId: string | null;
    onboardingCompletedAt: Date | null;
  } | null;
}

/**
 * Map a Prisma `User` row (with profile included) into the
 * `AuthUser` + `UserProfile` pair used by the bundle response.
 */
const toBundleParts = (row: UserBundleRow): { user: AuthUser; profile: UserProfile | null } => {
  const user: AuthUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    authProvider: row.authProvider as AuthUser["authProvider"],
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
  if (!row.profile) {
    return { user, profile: null };
  }
  const profile: UserProfile = {
    id: row.profile.id,
    displayName: row.profile.displayName,
    niche: row.profile.niche as UserProfile["niche"],
    uploadFrequency: row.profile.uploadFrequency as UserProfile["uploadFrequency"],
    primaryGoal: row.profile.primaryGoal as UserProfile["primaryGoal"],
    recommendedPlanId: row.profile.recommendedPlanId,
    onboardingCompletedAt: row.profile.onboardingCompletedAt?.toISOString() ?? null,
  };
  return { user, profile };
};

/**
 * Fetch the full user bundle: user + profile + preferences + YouTube
 * connection. Single round-trip for the dashboard hydration.
 *
 * @param userId Authenticated user id.
 * @returns `UserBundleResponse`.
 */
export const getUserBundle = async (userId: string): Promise<UserBundleResponse> => {
  requireDatabase();
  const row = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!row) {
    // Token references a deleted user — same posture as auth.service.me.
    // Returning a 401 here is the controller's job, so this service
    // just throws.
    const { AppError } = await import("../../errors/AppError.js");
    throw new AppError(401, "UNAUTHENTICATED", "Your session is no longer valid.");
  }
  const { user, profile } = toBundleParts(row);
  const preferences: UserPreferences = await getPreferences(userId);
  const youtubeConnection: YouTubeConnection = stubbedYouTubeConnection();
  return {
    user,
    profile,
    preferences,
    onboardingCompleted: profile?.onboardingCompletedAt != null,
    youtubeConnection,
  };
};
