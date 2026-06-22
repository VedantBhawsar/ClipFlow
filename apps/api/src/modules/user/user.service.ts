/**
 * User-bundle service.
 *
 * Provides the combined "everything the dashboard chrome needs in one
 * call" read used by the web client on hydration. The same data shape
 * is also useful for any future server-side rendering pass.
 *
 * Each piece (user, profile, preferences, YouTube) is fetched via the
 * existing service functions to keep logic in one place. The bundle is
 * cached as a single blob so partial writes can invalidate one key.
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
import type { ChannelConnectionStatus } from "@prisma/client";

/**
 * Map Prisma ChannelConnectionStatus enum to the API string union.
 */
const channelStatusToApi = (
  status: ChannelConnectionStatus,
): YouTubeConnection["status"] => {
  switch (status) {
    case "CONNECTED":
      return "connected";
    case "NEEDS_REAUTH":
      return "needs_reauth";
    case "DISCONNECTED":
      return "disconnected";
  }
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
  youtubeChannel: {
    youtubeChannelId: string;
    channelTitle: string;
    channelThumbnailUrl: string | null;
    status: ChannelConnectionStatus;
    createdAt: Date;
    lastVerifiedAt: Date;
  } | null;
}

/**
 * Map a Prisma `User` row (with profile and youtubeChannel included) into the
 * `AuthUser` + `UserProfile` + `YouTubeConnection` trio used by the bundle response.
 */
const toBundleParts = (row: UserBundleRow): {
  user: AuthUser;
  profile: UserProfile | null;
  youtubeConnection: YouTubeConnection;
} => {
  const user: AuthUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    authProvider: row.authProvider as AuthUser["authProvider"],
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };

  let profile: UserProfile | null = null;
  if (row.profile) {
    profile = {
      id: row.profile.id,
      displayName: row.profile.displayName,
      niche: row.profile.niche as UserProfile["niche"],
      uploadFrequency: row.profile.uploadFrequency as UserProfile["uploadFrequency"],
      primaryGoal: row.profile.primaryGoal as UserProfile["primaryGoal"],
      recommendedPlanId: row.profile.recommendedPlanId,
      onboardingCompletedAt: row.profile.onboardingCompletedAt?.toISOString() ?? null,
    };
  }

  let youtubeConnection: YouTubeConnection;
  if (row.youtubeChannel) {
    youtubeConnection = {
      status: channelStatusToApi(row.youtubeChannel.status),
      channelId: row.youtubeChannel.youtubeChannelId,
      channelTitle: row.youtubeChannel.channelTitle,
      channelThumbnailUrl: row.youtubeChannel.channelThumbnailUrl,
      connectedAt: row.youtubeChannel.createdAt.toISOString(),
      lastVerifiedAt: row.youtubeChannel.lastVerifiedAt.toISOString(),
    };
  } else {
    youtubeConnection = {
      status: "disconnected",
      channelId: null,
      channelTitle: null,
      channelThumbnailUrl: null,
      connectedAt: null,
      lastVerifiedAt: null,
    };
  }

  return { user, profile, youtubeConnection };
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
    include: { profile: true, youtubeChannel: true },
  });
  if (!row) {
    // Token references a deleted user — same posture as auth.service.me.
    // Returning a 401 here is the controller's job, so this service
    // just throws.
    const { AppError } = await import("../../errors/AppError.js");
    throw new AppError(401, "UNAUTHENTICATED", "Your session is no longer valid.");
  }
  const { user, profile, youtubeConnection } = toBundleParts(row);
  const preferences: UserPreferences = await getPreferences(userId);
  return {
    user,
    profile,
    preferences,
    onboardingCompleted: profile?.onboardingCompletedAt != null,
    youtubeConnection,
  };
};
