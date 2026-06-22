"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuthContext } from "@/lib/auth-context";

interface AuthGuardProps {
  children: ReactNode;
  /**
   * Where to send unauthenticated users. Defaults to /signin.
   */
  redirectTo?: string;
}

/**
 * Client-side guard. While the auth context is hydrating we render a
 * minimal placeholder so the protected page doesn't flash into view.
 * Once we know the user is unauthenticated, we redirect.
 *
 * Preserves the current path on redirect via ?next= so the sign-in
 * flow can return the user where they were headed. We skip the
 * redirect when already on /signin or /signup to avoid loops, and we
 * never carry a `next` from an auth-route onto itself.
 *
 * NOTE: this is intentionally client-only. The token lives in a regular
 * cookie (see api-client.ts for the trade-off comment) so middleware
 * *could* in principle read it on the server, but doing so would require
 * duplicating the redirect logic and would risk drift. The client guard
 * is the single source of truth for v1.
 */
export function AuthGuard({ children, redirectTo = "/signin" }: AuthGuardProps) {
  const { status } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    // Don't bounce between /signin and /signup.
    if (pathname === "/signin" || pathname.startsWith("/signin/")) return;
    if (pathname === "/signup" || pathname.startsWith("/signup/")) return;

    const target =
      pathname && pathname !== redirectTo
        ? `${redirectTo}?next=${encodeURIComponent(pathname)}`
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
