"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";

import { queryKeys } from "@/lib/query-keys";

/**
 * Sign out via NextAuth.
 *
 *  1. NextAuth clears its httpOnly session cookie (which holds both
 *     the access and refresh tokens).
 *  2. The `events.signOut` callback inside `auth.ts` runs server-side
 *     and POSTs to Express `/api/auth/logout` with the refresh token
 *     so it gets revoked in the RefreshToken table — that breaks the
 *     rotation chain for any compromised token a thief might have
 *     captured before the user clicked Sign Out.
 *  3. We drop every cached query so the next user on this browser tab
 *     can't see the previous user's bundle on a back-nav.
 *
 * `redirect: false` keeps the navigation in the caller's hands — the
 * Sidebar does `router.push("/signin")` after `await mutateAsync()`.
 *
 * Best-effort: if NextAuth's signOut itself fails (network), we still
 * clear local cache so the UI can't show the previous user's data.
 * Express revocation is best-effort; the refresh token will still
 * expire naturally in `REFRESH_TOKEN_EXPIRES_IN`.
 */
export function useSignOut() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await signOut({ redirect: false });
    },
    onSettled: () => {
      // Drop everything. The cache is keyed by our queryKeys factory;
      // no third-party queries live here.
      qc.removeQueries({ queryKey: queryKeys.settings.bundle() });
      qc.removeQueries({ queryKey: queryKeys.settings.youtubeConnection() });
      qc.removeQueries({ queryKey: queryKeys.onboarding.status() });
      qc.clear();
    },
  });
}