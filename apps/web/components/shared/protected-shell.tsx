"use client";

import type { ReactNode } from "react";

import { AuthGuard } from "@/lib/auth-guard";

/**
 * Wrap page contents that need an authenticated user but want to stay
 * a server component (so they can export `metadata`). The AuthGuard is
 * a client component, but the parent page can pass it JSX as children
 * across the server/client boundary.
 *
 * Used by /youtube-connect, /onboarding/*, and /dashboard/* since each
 * of those pages wants server-side metadata generation but client-side
 * auth + onboarding gating.
 */
export function ProtectedShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AuthGuard>{children}</AuthGuard>
    </div>
  );
}
