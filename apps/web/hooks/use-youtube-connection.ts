"use client";

import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import type { YouTubeConnection } from "@clipflow/types";

/**
 * Narrow YouTube-connection read for /settings/connected. The
 * YouTubeConnectCard on the dashboard reads the same key (already
 * warm) via `queryKeys.settings.bundle().youtubeConnection` — both
 * are kept in sync by the connect/disconnect mutations.
 */
export function useYouTubeConnection() {
  const api = useApi();
  return useQuery<YouTubeConnection>({
    queryKey: queryKeys.settings.youtubeConnection(),
    queryFn: () => api.getYouTubeConnection(),
    enabled: !!api,
  });
}