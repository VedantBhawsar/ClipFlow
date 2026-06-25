/**
 * Settings service.
 *
 * Owns the lazy "settings-shaped" read: profile + preferences +
 * YouTube connection. The dashboard chrome no longer hydrates from
 * this on every render — it lives behind `/api/settings` and is only
 * fetched by the settings pages and the YouTube connection card.
 *
 * Implementation: one Prisma query joins User + UserProfile +
 * YouTubeChannel; a second `getPreferences` call materializes the
 * runtime-preferences row (which is upserted on first read so callers
 * never have to worry about "has the user opened settings yet?").
 *
 * Cache: the controller caches the whole `SettingsResponse` for 30 s
 * under key `settings:${userId}`. Every write that could affect this
 * shape (profile, preferences, change-password, YouTube connect /
 * disconnect) invalidates the same key.
 */
import type {
  SettingsResponse,
  UserPreferences,
  UserProfile,
  YouTubeConnection,
} from "@clipflow/types";
import type { ChannelConnectionStatus } from "@prisma/client";
import { cache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import {
  getPreferences,
  toPreferencesDto,
} from "../preferences/preferences.service.js";

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

const toProfileDto = (p: {
  id: string;
  displayName: string | null;
  niche: string | null;
  uploadFrequency: string | null;
  primaryGoal: string | null;
  recommendedPlanId: string | null;
  onboardingCompletedAt: Date | null;
}): UserProfile => ({
  id: p.id,
  displayName: p.displayName,
  niche: p.niche as UserProfile["niche"],
  uploadFrequency: p.uploadFrequency as UserProfile["uploadFrequency"],
  primaryGoal: p.primaryGoal as UserProfile["primaryGoal"],
  recommendedPlanId: p.recommendedPlanId,
  onboardingCompletedAt: p.onboardingCompletedAt?.toISOString() ?? null,
});

const disconnectedYouTubeStub = (): YouTubeConnection => ({
  status: "disconnected",
  channelId: null,
  channelTitle: null,
  channelThumbnailUrl: null,
  connectedAt: null,
  lastVerifiedAt: null,
});

const toYouTubeConnectionDto = (c: {
  youtubeChannelId: string;
  channelTitle: string;
  channelThumbnailUrl: string | null;
  status: ChannelConnectionStatus;
  createdAt: Date;
  lastVerifiedAt: Date;
}): YouTubeConnection => ({
  status: channelStatusToApi(c.status),
  channelId: c.youtubeChannelId,
  channelTitle: c.channelTitle,
  channelThumbnailUrl: c.channelThumbnailUrl,
  connectedAt: c.createdAt.toISOString(),
  lastVerifiedAt: c.lastVerifiedAt.toISOString(),
});

/**
 * Fetch the lazy settings bundle for the dashboard settings pages.
 *
 * @param userId Authenticated user id.
 * @returns `SettingsResponse` — `{ profile, preferences, youtubeConnection }`.
 */
export const getSettings = async (
  userId: string,
): Promise<SettingsResponse> => {
  requireDatabase();

  const row = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, youtubeChannel: true, preferences: true },
  });
  const profile = row?.profile ? toProfileDto(row.profile) : null;
  const youtubeConnection = row?.youtubeChannel
    ? toYouTubeConnectionDto(row.youtubeChannel)
    : disconnectedYouTubeStub();

  const preferences = row?.preferences
    ? toPreferencesDto(row?.preferences)
    : null;

  return { profile, preferences, youtubeConnection };
};

/**
 * Drop the cached settings entry for a user. Exported so any write
 * path that could affect profile / preferences / YouTube connection
 * can invalidate the bundle without depending on this module's
 * internals.
 */
export const invalidateSettingsCache = async (
  userId: string,
): Promise<void> => {
  await cache.del(settingsCacheKey(userId));
};

export const settingsCacheKey = (userId: string): string =>
  `settings:${userId}`;
