"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";

/**
 * Identity hook for components.
 *
 * After the bundle-split refactor, this hook is a thin facade over
 * NextAuth's `useSession()` — no TanStack Query, no API round-trips.
 * Identity fields (`user.name`, `user.email`) and the session flags
 * (`onboardingCompleted`, `displayName`) all live inside the
 * NextAuth session JWT, populated from the register/login/refresh
 * responses.
 *
 * Components that need settings-shaped data (profile fields,
 * preferences, YouTube connection) call `useSettings()` /
 * `useYouTubeConnection()` directly instead of going through this
 * hook — there's no value in layering them through a generic facade
 * anymore.
 */
export interface UseAuthValue {
  status: "loading" | "authenticated" | "unauthenticated";
  /** Identity fields — id / name / email — straight from the JWT. */
  user: {
    id: string;
    email: string | null | undefined;
    name: string | null | undefined;
    onboardingCompleted: boolean;
    displayName: string | null;
  } | null;
  /**
   * Convenience flag — same as `user?.onboardingCompleted`. Kept as a
   * top-level field for the (many) call sites that only need the
   * boolean, e.g. `<OnboardingGuard>`.
   */
  onboardingCompleted: boolean;
  /**
   * Convenience flag — same as `user?.displayName`. Used by the
   * dashboard chrome to greet the user by name.
   */
  displayName: string | null;
  /**
   * Manually refresh the NextAuth session. Forces the `jwt` callback
   * to run, which transparently rotates the access token if needed.
   * Re-exported here so call sites that don't need the rest of
   * `useSession()` can still trigger a refresh in one call.
   */
  refresh: () => Promise<void>;
  /**
   * Forwarded `update()` from `useSession()`. Used by the onboarding
   * wizard to push the freshly-completed `onboardingCompleted` flag
   * into the cookie so `<OnboardingGuard>` doesn't bounce the user
   * back to `/onboarding/profile`.
   */
  update: ReturnType<typeof useSession>["update"];
}

export function useAuth(): UseAuthValue {
  const { status, data: session, update } = useSession();

  const userId = typeof session?.userId === "string" ? session.userId : null;
  const user = userId
    ? {
        id: userId,
        email: session?.user?.email,
        name: session?.user?.name,
        onboardingCompleted: session?.user?.onboardingCompleted ?? false,
        displayName: session?.user?.displayName ?? null,
      }
    : null;

  const refresh = async (): Promise<void> => {
    await update();
  };

  return useMemo<UseAuthValue>(
    () => ({
      status,
      user,
      onboardingCompleted: user?.onboardingCompleted ?? false,
      displayName: user?.displayName ?? null,
      refresh,
      update,
    }),
    [status, user, update],
  );
}