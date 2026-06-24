"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";

import { createApiClient, type ApiClient } from "@/lib/api-client";

/**
 * Hook that returns a typed `api` surface bound to the current session's
 * access token. Replaces the previous module-level `api` export that
 * read the token from a non-httpOnly cookie — that's gone now, the
 * token only ever lives inside NextAuth's session cookie (httpOnly).
 *
 * The client is memoized on the token so React re-renders (e.g. status
 * changes) don't churn request handler identity. Callers don't need
 * to memoize the result themselves; spreading it into a `useMutation`
 * `mutationFn` works because the closure captures the latest token at
 * the moment of the call.
 *
 * `accessToken` is `null` while the session is loading or unauthenticated;
 * the api-client methods will throw with a friendly message on those
 * calls (no Authorization header → backend returns 401 → SessionExpiredError
 * path takes over via the global query handler).
 */
export function useApi(): ApiClient {
  const { data: session } = useSession();
  const accessToken = session?.accessToken ?? null;
  return useMemo(() => createApiClient(accessToken), [accessToken]);
}