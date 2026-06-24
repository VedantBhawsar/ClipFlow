"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { queryKeys } from "@/lib/query-keys";
import { useUpdatePreferences } from "@/hooks/use-update-preferences";
import { useUserBundle } from "@/hooks/use-user-bundle";
import type {
  AuthUser,
  UpdatePreferencesRequest,
  UserPreferences,
  UserProfile,
  YouTubeConnection,
} from "@clipflow/types";

/**
 * Combined auth + server-data hook for components.
 *
 * Surface preserved from the pre-NextAuth era so existing call sites
 * (Sidebar, settings forms, onboarding wizard, signin/signup forms)
 * keep working with the minimum diff. Internally:
 *
 *   - status comes from NextAuth's `useSession()`.
 *   - user, profile, preferences, youtubeConnection, onboardingCompleted
 *     come from `useUserBundle()` — same as before.
 *   - signIn / signUp / signOut are no longer methods on this hook.
 *     Components call NextAuth's `signIn` / `signOut` from `@/auth`
 *     directly inside their event handlers. (NextAuth's `signIn`
 *     navigates / performs a form post by design, so it doesn't fit
 *     behind a `useMutation`-shaped facade.)
 *   - refresh is `useSession().update()` (NextAuth's manual session
 *     refresh); kept as a method for API parity with the pre-NextAuth
 *     `useAuth().refresh()`.
 *   - setOnboardingCompleted / setPreferences / patchPreferences are
 *     thin wrappers over the QueryClient / mutation hooks so call
 *     sites that did `await patchPreferences(...)` keep their shape.
 *
 * New code is welcome to call the query hooks directly
 * (useUserBundle, useUpdatePreferences, useConnectYouTube, …) instead
 * of going through this facade — the facade exists only to avoid
 * re-wiring every call site in a single PR.
 */
export interface UseAuthValue {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  youtubeConnection: YouTubeConnection | null;
  onboardingCompleted: boolean;
  /**
   * Manually refresh the NextAuth session. Forces the `jwt` callback
   * to run, which transparently rotates the access token if needed.
   */
  refresh: () => Promise<void>;
  /**
   * Optimistically mark onboarding complete from a freshly-submitted
   * UserProfile without waiting for the bundle refetch.
   */
  setOnboardingCompleted: (profile: UserProfile) => void;
  /**
   * Optimistically replace the cached preferences.
   */
  setPreferences: (next: UserPreferences) => void;
  /**
   * PATCH /api/user/preferences and update the cache.
   */
  patchPreferences: (body: UpdatePreferencesRequest) => Promise<UserPreferences>;
}

export function useAuth(): UseAuthValue {
  const { status, update } = useSession();
  const bundle = useUserBundle();
  const qc = useQueryClient();
  const updatePrefs = useUpdatePreferences();

  const user = bundle.data?.user ?? null;
  const profile = bundle.data?.profile ?? null;
  const preferences = bundle.data?.preferences ?? null;
  const youtubeConnection = bundle.data?.youtubeConnection ?? null;
  const onboardingCompleted = bundle.data?.onboardingCompleted ?? false;

  const refresh = async (): Promise<void> => {
    await update();
  };

  const setOnboardingCompleted = (next: UserProfile): void => {
    qc.setQueryData(queryKeys.user.bundle(), (old) => {
      if (!old) return old;
      return {
        ...old,
        profile: next,
        onboardingCompleted: next.onboardingCompletedAt !== null,
      };
    });
  };

  const setPreferences = (next: UserPreferences): void => {
    qc.setQueryData(queryKeys.user.bundle(), (old) =>
      old ? { ...old, preferences: next } : old,
    );
  };

  const patchPreferences = async (
    body: UpdatePreferencesRequest,
  ): Promise<UserPreferences> => {
    return updatePrefs.mutateAsync(body);
  };

  return useMemo<UseAuthValue>(
    () => ({
      status,
      user,
      profile,
      preferences,
      youtubeConnection,
      onboardingCompleted,
      refresh,
      setOnboardingCompleted,
      setPreferences,
      patchPreferences,
    }),
    [
      status,
      user,
      profile,
      preferences,
      youtubeConnection,
      onboardingCompleted,
      refresh,
      setOnboardingCompleted,
      setPreferences,
      patchPreferences,
    ],
  );
}