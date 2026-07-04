import type { ReactNode } from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { ProtectedShell } from "@/components/shared/protected-shell";
import { OnboardingGuard } from "@/lib/onboarding-guard";

/**
 * Dashboard chrome.
 *
 * Three breakpoints, three layouts:
 *  - `lg+` — fixed left sidebar + scrollable content. The sidebar is
 *    rendered server-side and the OnboardingGuard inside <ProtectedShell>
 *    handles the "not finished onboarding" redirect.
 *  - `<lg` — sticky top bar (Menu trigger + brand) above the same
 *    content. The sidebar becomes a left-edge drawer opened from the
 *    Menu button.
 *
 * Why no `h-screen` here: the body is the only scroll surface on
 * mobile (Design.md §5 — no nested scroll regions). `min-h-svh` keeps
 * the chrome anchored to the smallest viewport dimension while still
 * letting long pages scroll naturally. The desktop sidebar still gets
 * its full height via flex.
 *
 * Content is capped at `max-w-5xl` per Design.md Section 2's 960px
 * reading-column rule. The dashboard sub-pages follow the same cap.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedShell>
      <div className="flex min-h-svh bg-[color:var(--bg)]">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar — Menu button visible below `lg`; the
              desktop sidebar handles its own nav. Hidden on `lg+`
              via `lg:hidden` on the trigger. */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[color:var(--line)] bg-[color:var(--surface)] px-4 lg:hidden">
            <MobileNav />
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8">
            <OnboardingGuard mode="require-complete">{children}</OnboardingGuard>
          </main>
        </div>
      </div>
    </ProtectedShell>
  );
}