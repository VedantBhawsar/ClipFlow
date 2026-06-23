"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, setAuthTokenCookie } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { AuthResponse, RegisterRequest } from "@clipflow/types";

/**
 * Sign up. Same cache dance as useSignIn: write the token, drop the
 * stale bundle query, and refetch — the freshly-created user starts
 * with no profile, so OnboardingGuard will reroute to /onboarding.
 */
export function useSignUp() {
  const qc = useQueryClient();
  return useMutation<AuthResponse, Error, RegisterRequest>({
    mutationFn: (body) => api.register(body),
    onSuccess: (res) => {
      setAuthTokenCookie(res.token);
      qc.removeQueries({ queryKey: queryKeys.user.bundle() });
      void qc.invalidateQueries({ queryKey: queryKeys.user.bundle() });
    },
  });
}
