import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/shared/logo";
import { ProtectedShell } from "@/components/shared/protected-shell";
import { OnboardingGuard } from "@/lib/onboarding-guard";

/**
 * Onboarding shell. No app sidebar yet (the user isn't in the app
 * proper) — just the brand mark and the wizard. OnboardingGuard
 * bounces completed users to /dashboard before they see this page.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedShell>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="flex items-center px-6 py-5">
          <Link href="/" aria-label="ClipFlow home" className="inline-flex">
            <Logo />
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 py-6 sm:items-center sm:py-12">
          <div className="w-full max-w-[640px]">
            <OnboardingGuard mode="require-incomplete">{children}</OnboardingGuard>
          </div>
        </main>
      </div>
    </ProtectedShell>
  );
}
