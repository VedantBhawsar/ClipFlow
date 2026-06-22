import type { ReactNode } from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import { ProtectedShell } from "@/components/shared/protected-shell";
import { OnboardingGuard } from "@/lib/onboarding-guard";

/**
 * Dashboard chrome. The sidebar is rendered server-side and the
 * OnboardingGuard inside <ProtectedShell> handles the
 * "not finished onboarding" redirect.
 *
 * NOTE: the sidebar is rendered as a client component (it reads the
 * pathname + auth context) but its layout slot can be a server
 * component — Next.js allows client components inside server layouts.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedShell>
      <div className="flex min-h-svh bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <main className="mx-auto w-full max-w-[960px] flex-1 px-6 py-8 sm:px-8">
            <OnboardingGuard mode="require-complete">{children}</OnboardingGuard>
          </main>
        </div>
      </div>
    </ProtectedShell>
  );
}
