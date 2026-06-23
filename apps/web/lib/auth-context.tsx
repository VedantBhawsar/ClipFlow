"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useSignIn } from "@/hooks/use-sign-in";
import { useSignOut } from "@/hooks/use-sign-out";
import { useSignUp } from "@/hooks/use-sign-up";
import { useUserBundle } from "@/hooks/use-user-bundle";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@clipflow/types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Auth surface owned by AuthContext. Deliberately narrow: just the
 * loading/authenticated/unauthenticated status and the three auth
 * actions. Server-derived data (user, profile, preferences,
 * youtubeConnection, onboardingCompleted) lives in the TanStack Query
 * bundle cache and is exposed via `useAuth()`'s facade, not here.
 *
 * Keeping the context auth-only makes it impossible for a component to
 * accidentally couple itself to cached server data through the
 * context; the data layer is the query layer.
 */
export interface AuthContextValue {
  status: AuthStatus;
  signIn: (body: LoginRequest) => Promise<AuthResponse>;
  signUp: (body: RegisterRequest) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const bundle = useUserBundle();
  const signInMutation = useSignIn();
  const signUpMutation = useSignUp();
  const signOutMutation = useSignOut();

  // Derive status from the bundle query. Pending → loading (we don't
  // know yet). Has data → authenticated. Errored or absent → unauthenticated
  // (the api-client + global queryCache.onError will have cleared the
  // cookie and bounced to /signin on a 401 by now).
  const status: AuthStatus = bundle.isPending
    ? "loading"
    : bundle.data
      ? "authenticated"
      : "unauthenticated";

  const signIn = useCallback(
    async (body: LoginRequest): Promise<AuthResponse> => {
      return signInMutation.mutateAsync(body);
    },
    [signInMutation],
  );

  const signUp = useCallback(
    async (body: RegisterRequest): Promise<AuthResponse> => {
      return signUpMutation.mutateAsync(body);
    },
    [signUpMutation],
  );

  const signOut = useCallback(async (): Promise<void> => {
    // The mutation's onSettled already cleared the cookie + query cache
    // regardless of server outcome. We then send the user to /signin.
    await signOutMutation.mutateAsync();
    router.push("/signin");
  }, [signOutMutation, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, signIn, signUp, signOut }),
    [status, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used inside <AuthProvider>");
  }
  return ctx;
}
