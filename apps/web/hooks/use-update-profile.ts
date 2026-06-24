"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import type {
  PatchProfileRequest,
  UpdateProfileRequest,
  UserProfile,
} from "@clipflow/types";

/**
 * Update the authenticated user's profile. Two flavors:
 *  - submitOnboardingProfile (POST): used by the onboarding wizard;
 *    ALSO stamps onboardingCompletedAt.
 *  - patchOnboardingProfile (PATCH): used by the settings page; does
 *    NOT stamp onboardingCompletedAt.
 *
 * Both return the updated UserProfile. We write it into the bundle
 * cache; if the POST case has now completed onboarding we also flip
 * onboardingCompleted so the OnboardingGuard reroutes correctly.
 */
export function useUpdateProfile() {
  const api = useApi();
  const qc = useQueryClient();
  const writeProfile = (profile: UserProfile): void => {
    qc.setQueryData(queryKeys.user.bundle(), (old) => {
      if (!old) return old;
      return {
        ...old,
        profile,
        // onboardingCompletedAt is part of UserProfile; derive the
        // boolean the rest of the app uses.
        onboardingCompleted: profile.onboardingCompletedAt !== null,
      };
    });
    void qc.invalidateQueries({ queryKey: queryKeys.user.bundle() });
  };

  const submit = useMutation<UserProfile, Error, UpdateProfileRequest>({
    mutationFn: (body) => api.submitOnboardingProfile(body),
    onSuccess: writeProfile,
  });

  const patch = useMutation<UserProfile, Error, PatchProfileRequest>({
    mutationFn: (body) => api.patchOnboardingProfile(body),
    onSuccess: writeProfile,
  });

  return { submit, patch };
}