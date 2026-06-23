"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, clearAuthTokenCookie } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Sign out. On success (or on best-effort failure — sign-out must be
 * tolerant of network errors): clear the cookie, drop the entire
 * query cache so the next user on this browser tab can't see the
 * previous user's bundle, and reset any bundle query to a clean state.
 *
 * The caller (auth context) is responsible for the actual
 * router.push("/signin"); this hook just owns the data side.
 */
export function useSignOut() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => api.logout(),
    onSettled: () => {
      clearAuthTokenCookie();
      // Drop everything. removeQueries covers every key (the cache is
      // keyed by our queryKeys factory; no third-party queries live here).
      qc.removeQueries({ queryKey: queryKeys.user.bundle() });
      qc.removeQueries({ queryKey: queryKeys.user.youtubeConnection() });
      qc.removeQueries({ queryKey: queryKeys.onboarding.status() });
      qc.clear();
    },
  });
}
