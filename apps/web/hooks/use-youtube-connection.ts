"use client";

import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import type { YouTubeConnection } from "@clipflow/types";

/**
 * Narrow YouTube-connection read for /settings/connected. Cheaper than
 * the full bundle; the YouTubeConnectCard on the dashboard reads from
 * the bundle (already warm) instead.
 */
export function useYouTubeConnection() {
  const api = useApi();
  return useQuery<YouTubeConnection>({
    queryKey: queryKeys.user.youtubeConnection(),
    queryFn: () => api.getYouTubeConnection(),
    enabled: !!api,
  });
}