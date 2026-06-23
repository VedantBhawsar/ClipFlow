"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuthContext } from "@/lib/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { useUpdatePreferences } from "@/hooks/use-update-preferences";
import { useUserBundle } from "@/hooks/use-user-bundle";
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
  UpdatePreferencesRequest,
  UserPreferences,
  UserProfile,
  YouTubeConnection,
} from "@clipflow/types";

/**
 * Combined auth + server-data hook for components.
 *
 * The shape is preserved from the pre-TanStack-Query era so existing
 * call sites (Sidebar, settings forms, onboarding wizard, signin/signup
 * forms) keep working with the minimum diff. Internally:
 *
 *   - status, signIn, signUp, signOut come from AuthContext (which
 *     owns auth state and action wrappers around the mutation hooks).
 *   - user, profile, preferences, youtubeConnection, onboardingCompleted
 *     come from useUserBundle() — the canonical read for everything
 *     server-derived.
 *   - refresh, setOnboardingCompleted, setPreferences, patchPreferences
 *     are thin wrappers over the QueryClient / mutation hooks so
 *     components that previously did `await refresh()` keep working.
 *
 * New code is welcome to call the query hooks directly
 * (useUserBundle, useUpdatePreferences, useConnectYouTube, …) instead
 * of going through this facade — the facade exists only to avoid
 * re-wiring 12+ files in a single PR.
 */
export interface UseAuthValue {
  status: ReturnType<typeof useAuthContext>["status"];
  user: AuthUser | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  youtubeConnection: YouTubeConnection | null;
  onboardingCompleted: boolean;
  signIn: (body: LoginRequest) => Promise<AuthResponse>;
  signUp: (body: RegisterRequest) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
  /**
   * Refetch the user bundle. Kept for API compatibility with the
   * pre-TanStack-Query call sites; prefer queryClient.invalidateQueries
   * in new code.
   */
  refresh: () => Promise<void>;
  /**
   * Optimistically mark onboarding complete from a freshly-submitted
   * UserProfile without waiting for the bundle refetch. Kept for
   * API compatibility; the onboarding wizard doesn't need it anymore
   * since the mutation's onSuccess already updates the cache.
   */
  setOnboardingCompleted: (profile: UserProfile) => void;
  /**
   * Optimistically replace the cached preferences. Kept for API
   * compatibility; mutation onSuccess already does this.
   */
  setPreferences: (next: UserPreferences) => void;
  /**
   * PATCH /api/user/preferences and update the cache. Thin wrapper
   * over useUpdatePreferences; kept so call sites that imported
   * `patchPreferences` from useAuth keep their shape.
   */
  patchPreferences: (body: UpdatePreferencesRequest) => Promise<UserPreferences>;
}

export function useAuth(): UseAuthValue {
  const { status, signIn, signUp, signOut } = useAuthContext();
  const bundle = useUserBundle();
  const qc = useQueryClient();
  const updatePrefs = useUpdatePreferences();

  const user = bundle.data?.user ?? null;
  const profile = bundle.data?.profile ?? null;
  const preferences = bundle.data?.preferences ?? null;
  const youtubeConnection = bundle.data?.youtubeConnection ?? null;
  const onboardingCompleted = bundle.data?.onboardingCompleted ?? false;

  const refresh = useCallback(async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: queryKeys.user.bundle() });
  }, [qc]);

  const setOnboardingCompleted = useCallback(
    (next: UserProfile) => {
      qc.setQueryData(queryKeys.user.bundle(), (old) => {
        if (!old) return old;
        return {
          ...old,
          profile: next,
          onboardingCompleted: next.onboardingCompletedAt !== null,
        };
      });
    },
    [qc],
  );

  const setPreferences = useCallback(
    (next: UserPreferences) => {
      qc.setQueryData(queryKeys.user.bundle(), (old) =>
        old ? { ...old, preferences: next } : old,
      );
    },
    [qc],
  );

  const patchPreferences = useCallback(
    async (body: UpdatePreferencesRequest): Promise<UserPreferences> => {
      return updatePrefs.mutateAsync(body);
    },
    [updatePrefs],
  );

  return useMemo<UseAuthValue>(
    () => ({
      status,
      user,
      profile,
      preferences,
      youtubeConnection,
      onboardingCompleted,
      signIn,
      signUp,
      signOut,
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
      signIn,
      signUp,
      signOut,
      refresh,
      setOnboardingCompleted,
      setPreferences,
      patchPreferences,
    ],
  );
}
