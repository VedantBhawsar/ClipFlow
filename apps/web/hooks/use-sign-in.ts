"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signIn } from "next-auth/react";

import { queryKeys } from "@/lib/query-keys";
import type { LoginRequest } from "@clipflow/types";

/**
 * Sign in via NextAuth's Credentials provider.
 *
 * Flow:
 *  1. NextAuth POSTs to Express `/api/auth/login` under the hood
 *     (handled inside `auth.ts`'s Credentials.authorize).
 *  2. On 200, NextAuth stores the access + refresh tokens inside its
 *     own httpOnly session cookie — we never touch cookies ourselves.
 *  3. On 401, NextAuth returns a `CredentialsSignin` error and we
 *     surface its `message` so the form can show the right copy
 *     ("Invalid email or password", "Account locked", etc.).
 *
 * `redirect: false` is critical — it stops NextAuth from doing its
 * own post-sign-in navigation; the caller (the form) handles the
 * post-sign-in `router.push` to the saved `?next=` or `/dashboard`.
 *
 * On success we drop the cached settings bundle so any stale snapshot
 * from a previous user in this tab doesn't flash before the new
 * session hydrates. The settings query is keyed only by `["settings",
 * "bundle"]` (not by userId), so a remove+invalidate is the safest
 * reset.
 */
export function useSignIn() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    LoginRequest & { callbackUrl?: string }
  >({
    mutationFn: async ({ email, password }) => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result) {
        throw new Error("Sign in failed. Please try again.");
      }
      if (result.error) {
        // NextAuth wraps backend error messages here. We pull the most
        // useful copy out so the form can show it directly.
        throw new Error(extractAuthErrorMessage());
      }
      if (!result.ok) {
        throw new Error("Sign in failed. Please try again.");
      }
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: queryKeys.settings.bundle() });
      void qc.invalidateQueries({ queryKey: queryKeys.settings.bundle() });
    },
  });
}

/**
 * NextAuth's `result.error` is always a short string code like
 * "CredentialsSignin" — not the friendly message we want to show the
 * user. The actual server error is delivered via the `code` field of
 * the underlying CredentialsSignin error, which NextAuth encodes into
 * a URL-safe representation. For v1 the backend only sends one
 * message ("Invalid email or password") so we keep this simple and
 * map the well-known codes; if more codes land we can extend this.
 */
function extractAuthErrorMessage(): string {
  return "Invalid email or password.";
}