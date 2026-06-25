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
 * Both return the updated UserProfile. We write it into the lazy
 * `settings.bundle()` cache so the settings profile form stays in
 * sync without a refetch. Note that we DON'T touch the NextAuth
 * session from this hook — the wizard flips `session.user
 * .onboardingCompleted` separately via `useSession().update()` after
 * a successful submit, so the guard picks it up on the next render.
 */
export function useUpdateProfile() {
  const api = useApi();
  const qc = useQueryClient();
  const writeProfile = (profile: UserProfile): void => {
    qc.setQueryData(queryKeys.settings.bundle(), (old) =>
      old ? { ...old, profile } : old,
    );
    void qc.invalidateQueries({ queryKey: queryKeys.settings.bundle() });
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