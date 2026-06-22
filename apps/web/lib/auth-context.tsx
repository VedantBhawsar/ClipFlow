"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  UserProfile,
} from "@clipflow/types";
import {
  api,
  clearAuthTokenCookie,
  setAuthTokenCookie,
} from "@/lib/api-client";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  profile: UserProfile | null;
  onboardingCompleted: boolean;
  signIn: (body: LoginRequest) => Promise<void>;
  signUp: (body: RegisterRequest) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Optimistically mark onboarding complete without re-fetching.
   * Used after the profile wizard successfully submits.
   */
  setOnboardingCompleted: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  // Track whether a refresh is in-flight so concurrent callers reuse it.
  const inflight = useRef<Promise<void> | null>(null);

  const applyAuthResponse = useCallback((res: AuthResponse) => {
    setAuthTokenCookie(res.token);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (inflight.current) return inflight.current;
    const promise = (async () => {
      try {
        const me = await api.me();
        setUser(me.user);
        setProfile(me.profile);
        setOnboardingCompleted(me.onboardingCompleted);
        setStatus("authenticated");
      } catch {
        // 401 inside api.me() already cleared the cookie + redirected;
        // any other error means we just don't have a session.
        setUser(null);
        setProfile(null);
        setOnboardingCompleted(false);
        setStatus("unauthenticated");
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = promise;
    return promise;
  }, []);

  // On mount: try to hydrate the session from the cookie.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (body: LoginRequest): Promise<void> => {
      const res = await api.login(body);
      applyAuthResponse(res);
      await refresh();
      router.refresh();
    },
    [applyAuthResponse, refresh, router],
  );

  const signUp = useCallback(
    async (body: RegisterRequest): Promise<void> => {
      const res = await api.register(body);
      applyAuthResponse(res);
      await refresh();
      router.refresh();
    },
    [applyAuthResponse, refresh, router],
  );

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } catch {
      // Even if the network call fails, we still want to clear locally.
    }
    clearAuthTokenCookie();
    setUser(null);
    setProfile(null);
    setOnboardingCompleted(false);
    setStatus("unauthenticated");
    router.push("/signin");
    router.refresh();
  }, [router]);

  const setProfileCompleted = useCallback((next: UserProfile) => {
    setProfile(next);
    setOnboardingCompleted(next.onboardingCompletedAt !== null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      onboardingCompleted,
      signIn,
      signUp,
      signOut,
      refresh,
      setOnboardingCompleted: setProfileCompleted,
    }),
    [
      status,
      user,
      profile,
      onboardingCompleted,
      signIn,
      signUp,
      signOut,
      refresh,
      setProfileCompleted,
    ],
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
