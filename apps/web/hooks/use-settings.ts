"use client";

import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import type { SettingsResponse } from "@clipflow/types";

/**
 * Lazy settings-shaped read for the settings pages and the YouTube
 * connection card. Hits `GET /api/settings`, which returns
 * `{ profile, preferences, youtubeConnection }` behind a 30 s
 * server-side cache.
 *
 * The dashboard chrome does NOT call this — identity and onboarding
 * status come straight from the NextAuth session JWT (see
 * `use-auth.ts`). Only the settings pages subscribe here, so the
 * dashboard chrome avoids the round-trip entirely.
 */
export function useSettings() {
  const api = useApi();
  return useQuery<SettingsResponse>({
    queryKey: queryKeys.settings.bundle(),
    queryFn: () => api.getSettings(),
    enabled: !!api,
  });
}