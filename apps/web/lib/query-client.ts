"use client";

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { clearAuthTokenCookie } from "@/lib/api-client";

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
 * Global error handlers centralize the 401 → sign-out behavior so any
 * query or mutation that gets a 401 ends the session the same way the
 * manual `api-client.request()` flow does today.
 */
export function makeQueryClient(): QueryClient {
  const handle401 = () => {
    clearAuthTokenCookie();
    if (
      typeof window !== "undefined" &&
      window.location.pathname !== "/signin"
    ) {
      window.location.href = "/signin";
    }
  };

  // The api-client throws a plain Error("Your session expired...") on 401;
  // we detect that by message rather than re-reading the response. This
  // keeps the QueryClient free of HTTP details it shouldn't know about.
  const isSessionExpired = (err: unknown): boolean =>
    err instanceof Error && err.message.startsWith("Your session expired");

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
        if (isSessionExpired(err)) handle401();
      },
    }),
    mutationCache: new MutationCache({
      onError: (err) => {
        if (isSessionExpired(err)) handle401();
      },
    }),
  });
}
