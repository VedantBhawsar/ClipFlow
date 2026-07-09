"use client";

/**
 * Hooks for the personalized-thumbnail-style onboarding step 5 and the
 * settings "Refresh my channel style" CTA.
 *
 * Two mutations:
 *
 * - `useFetchChannelThumbnails` — calls `GET /api/youtube/channel-recent-thumbnails`
 *   to populate the 4×2 selection grid. Returns up to 8 thumbnails.
 *   Caller passes `limit` (1-8, default 8) so the same hook works for
 *   both the wizard's 8-tile grid and any future 4-tile preview.
 *
 * - `useAnalyzePersonalizedThumbnails` — calls `POST /api/thumbnail-style/analyze`
 *   with the user's 1-4 picked URLs. The worker re-runs the analysis
 *   (bypassing the 24h idempotency guard) and the row's
 *   `confidence` field reflects whether the parse succeeded.
 *
 *   On success we invalidate `queryKeys.settings.bundle()` so the
 *   settings card re-renders with the fresh `channelThumbnailStyle`.
 *   We don't need cross-process worker→API cache invalidation: the
 *   API side caches `settings:${userId}` for 30s and the dashboard
 *   hydrates `onboardingCompleted` from the NextAuth session JWT (not
 *   from this bundle), so eventual consistency is fine.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";

export interface ChannelRecentThumbnail {
  videoId: string;
  title: string;
  thumbnailUrl: string;
}

export function useFetchChannelThumbnails() {
  const api = useApi();
  return useMutation<
    { items: ChannelRecentThumbnail[] },
    Error,
    number | undefined
  >({
    mutationFn: (limit) => api.fetchChannelRecentThumbnails(limit ?? 8),
  });
}

export function useAnalyzePersonalizedThumbnails() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<
    { jobId: string } | null,
    Error,
    { selectedThumbnailUrls: string[] }
  >({
    mutationFn: (body) => api.triggerPersonalizedStyleAnalysis(body),
    onSuccess: () => {
      // The settings card reads `channelThumbnailStyle` from the bundle
      // and the YouTube card renders the `lastAnalyzedAt` timestamp —
      // both are sourced from `settings.bundle()`. Invalidate so the
      // dashboard re-fetches within the next render.
      void qc.invalidateQueries({ queryKey: queryKeys.settings.bundle() });
      void qc.invalidateQueries({
        queryKey: queryKeys.settings.youtubeConnection(),
      });
    },
  });
}