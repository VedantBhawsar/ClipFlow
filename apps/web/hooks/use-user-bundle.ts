"use client";

import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
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
 * `enabled` is gated on the access token existing in the session —
 * without this, calling the bundle from /signin would 401, fire the
 * global SessionExpiredError handler, and bounce back to /signin in
 * an infinite loop. With the gate, the query is just disabled until
 * NextAuth has a session, and the AuthGuard handles the redirect.
 */
export function useUserBundle() {
  const api = useApi();
  return useQuery<UserBundleResponse>({
    queryKey: queryKeys.user.bundle(),
    queryFn: () => api.getUserBundle(),
    enabled: !!api,
  });
}