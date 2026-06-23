"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { UserBundleResponse } from "@clipflow/types";

/**
 * The single round-trip read of user + profile + preferences + YouTube
 * connection. Used by the auth context to derive `status` and by the
 * dashboard chrome (sidebar, YouTubeConnectCard) to render.
 *
 * TanStack Query handles caching, deduplication (concurrent callers
 * share one fetch), and invalidation (any successful mutation calls
 * `invalidateQueries({ queryKey: queryKeys.user.bundle() })` and
 * active consumers re-fetch in the background).
 *
 * No `enabled` gate: the api-client's 401 handler already short-circuits
 * the redirect on /signin (where the user has no token), and gating the
 * query on cookie presence would race with the post-signin invalidation
 * — the query would still be disabled at the moment of invalidate.
 */
export function useUserBundle() {
  return useQuery<UserBundleResponse>({
    queryKey: queryKeys.user.bundle(),
    queryFn: () => api.getUserBundle(),
  });
}
