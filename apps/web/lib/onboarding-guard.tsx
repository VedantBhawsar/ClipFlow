"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuthContext } from "@/lib/auth-context";

interface OnboardingGuardProps {
  children: ReactNode;
  /**
   * "require-incomplete": only render for users who haven't finished
   * onboarding; send completed users to /dashboard. (Used inside /onboarding/*.)
   *
   * "require-complete": only render for users who finished onboarding; send
   * incomplete users back to /onboarding/profile. (Used inside /dashboard.)
   */
  mode: "require-incomplete" | "require-complete";
}

/**
 * Client-side guard that enforces the "logged in + profile state" rules
 * described in AppFlow.md Section 1 / Section 9.
 *
 * - Visiting /onboarding/* after finishing onboarding → /dashboard
 * - Visiting /dashboard before finishing onboarding → /onboarding/profile
 *
 * Pair with <AuthGuard> at the page level to also gate on auth.
 */
export function OnboardingGuard({ children, mode }: OnboardingGuardProps) {
  const { status, onboardingCompleted } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (mode === "require-incomplete" && onboardingCompleted) {
      router.replace("/dashboard");
    } else if (mode === "require-complete" && !onboardingCompleted) {
      router.replace("/onboarding/profile");
    }
  }, [status, onboardingCompleted, mode, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (mode === "require-incomplete" && onboardingCompleted) return null;
  if (mode === "require-complete" && !onboardingCompleted) return null;

  return <>{children}</>;
}
