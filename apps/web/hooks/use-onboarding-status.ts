"use client";

import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import type { OnboardingStatusResponse } from "@clipflow/types";

/**
 * Onboarding-completion status. Used by /onboarding routes to decide
 * whether to show the wizard or redirect to /dashboard.
 *
 * `enabled` is gated on the api client being available (which itself
 * depends on a session access token); without this, the query would
 * fire without an Authorization header, get 401'd, fire the global
 * SessionExpiredError handler, and redirect-loop to /signin.
 */
export function useOnboardingStatus() {
  const api = useApi();
  return useQuery<OnboardingStatusResponse>({
    queryKey: queryKeys.onboarding.status(),
    queryFn: () => api.getOnboardingStatus(),
    enabled: !!api,
  });
}