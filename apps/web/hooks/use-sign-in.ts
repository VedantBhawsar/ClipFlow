"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, setAuthTokenCookie } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { AuthResponse, LoginRequest } from "@clipflow/types";

/**
 * Sign in. On success:
 *   1. Write the JWT into the auth cookie so the next request picks it up.
 *   2. Cancel any in-flight bundle query and invalidate it so the
 *      AuthProvider re-derives `status === "authenticated"` and any
 *      stale cached user data from the previous session is discarded.
 */
export function useSignIn() {
  const qc = useQueryClient();
  return useMutation<AuthResponse, Error, LoginRequest>({
    mutationFn: (body) => api.login(body),
    onSuccess: (res) => {
      setAuthTokenCookie(res.token);
      qc.removeQueries({ queryKey: queryKeys.user.bundle() });
      void qc.invalidateQueries({ queryKey: queryKeys.user.bundle() });
    },
  });
}
