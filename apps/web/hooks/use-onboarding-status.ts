"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { OnboardingStatusResponse } from "@clipflow/types";

/**
 * Onboarding-completion status. Used by /onboarding routes to decide
 * whether to show the wizard or redirect to /dashboard.
 */
export function useOnboardingStatus() {
  return useQuery<OnboardingStatusResponse>({
    queryKey: queryKeys.onboarding.status(),
    queryFn: () => api.getOnboardingStatus(),
  });
}
