"use client";

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";

import { SessionExpiredError } from "@/lib/api-client";

/**
 * Create a fresh QueryClient with the app's defaults.
 *
 * One client per browser session: <QueryProvider> calls this inside
 * useState so the client survives client-side navigation but is fresh on
 * a full page load. Tests that mount <QueryProvider> get their own.
 *
 * Defaults:
 *  - staleTime 60s: user-facing data (profile, preferences, YouTube
 *    connection) changes infrequently; 60s strikes a balance between
 *    "data is current" and "we don't refetch on every nav".
 *  - gcTime 5min: keep unused data warm so back-navigation is instant.
 *  - retry 1: the api-client already converts network errors to friendly
 *    messages; one retry catches transient blips without masking
 *    persistent failures.
 *  - refetchOnWindowFocus false: focus-refetches would race with our
 *    own optimistic updates and surface 401-redirect loops for users
 *    with stale cookies on backgrounded tabs.
 *  - refetchOnReconnect true: a flaky network drop should re-pull
 *    user data when connectivity returns.
 *
 * Global error handlers centralize the `SessionExpiredError` → sign-out
 * behavior so any query or mutation that gets a 401 ends the session
 * the same way. We `instanceof`-check the typed error (instead of
 * string-matching the message like the previous implementation) so a
 * refactor of the error message can't silently break session-end
 * handling.
 */
export function makeQueryClient(): QueryClient {
  const handleSessionExpired = async (): Promise<void> => {
    // `redirect: false` lets NextAuth clear the cookie + invoke the
    // events.signOut callback (which revokes the refresh token server-
    // side) without doing its own hard redirect — the affected query
    // surfaces its own error to the user and a subsequent nav will
    // hit the AuthGuard / middleware redirect.
    await signOut({ redirect: false });
  };

  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
    queryCache: new QueryCache({
      onError: (err) => {
        if (err instanceof SessionExpiredError) {
          void handleSessionExpired();
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (err) => {
        if (err instanceof SessionExpiredError) {
          void handleSessionExpired();
        }
      },
    }),
  });
}