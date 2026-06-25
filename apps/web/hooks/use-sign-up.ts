"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signIn } from "next-auth/react";

import { createApiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { AuthResponse, RegisterRequest } from "@clipflow/types";

/**
 * Sign up.
 *
 * Two-step by design:
 *  1. POST /api/auth/register on Express to create the account and
 *     receive the initial AuthResponse (which now carries
 *     accessToken + refreshToken; see auth.service.register).
 *  2. Immediately sign in via NextAuth's Credentials provider so the
 *     access + refresh tokens get persisted into NextAuth's httpOnly
 *     session cookie. We pass the same email/password through
 *     signIn("credentials", …) rather than hand-crafting a JWT — that
 *     way the rotation family starts in exactly one place (Express)
 *     and NextAuth's `jwt` callback owns the cookie.
 *
 * Why this shape vs. having Express's register auto-issue a NextAuth
 * session: keeping NextAuth as the single signer of the session cookie
 * means we get automatic refresh, CSRF protection, and
 * `events.signIn` / `events.signOut` callbacks for free.
 *
 * On success: drop the bundle query so the freshly-created user (with
 * no profile) is fetched cleanly; the OnboardingGuard will reroute
 * to /onboarding/profile.
 */
export function useSignUp() {
  const qc = useQueryClient();
  return useMutation<
    AuthResponse,
    Error,
    RegisterRequest & { callbackUrl?: string }
  >({
    mutationFn: async ({ email, password, name, callbackUrl }) => {
      // Register uses an unauthenticated api client — at this point
      // there's no session to attach an access token to.
      const anonApi = createApiClient(null);
      const res = await anonApi.register({ email, password, name });

      // Hand the credentials to NextAuth so it persists the tokens.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error || !result.ok) {
        // Account exists but session couldn't be established — uncommon.
        // The account is created; the user can retry sign-in on /signin.
        throw new Error(
          "Account created, but we couldn't sign you in. Try signing in.",
        );
      }

      void callbackUrl;
      return res;
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: queryKeys.settings.bundle() });
      void qc.invalidateQueries({ queryKey: queryKeys.settings.bundle() });
    },
  });
}