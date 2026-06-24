"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";

interface AuthGuardProps {
  children: ReactNode;
  /**
   * Where to send unauthenticated users. Defaults to /signin.
   */
  redirectTo?: string;
}

/**
 * Client-side guard. Renders a "Loading…" placeholder while NextAuth
 * resolves the session; once we know the user is unauthenticated,
 * redirects to /signin (preserving the original path via `callbackUrl`,
 * which NextAuth threads through the sign-in → post-sign-in flow).
 *
 * Skips the redirect when already on /signin or /signup to avoid
 * loops. Edge middleware (apps/web/middleware.ts) handles the cheap
 * cookie-presence redirect before this even runs — this component is
 * the source of truth for the finer client-side gating.
 */
export function AuthGuard({ children, redirectTo = "/signin" }: AuthGuardProps) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    // Don't bounce between /signin and /signup.
    if (pathname === "/signin" || pathname.startsWith("/signin/")) return;
    if (pathname === "/signup" || pathname.startsWith("/signup/")) return;

    const target =
      pathname && pathname !== redirectTo
        ? `${redirectTo}?callbackUrl=${encodeURIComponent(pathname)}`
        : redirectTo;
    router.replace(target);
  }, [status, redirectTo, pathname, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}