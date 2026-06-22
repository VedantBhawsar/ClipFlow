import type { ReactNode } from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import { ProtectedShell } from "@/components/shared/protected-shell";
import { SettingsLayout as SettingsLayoutComponent } from "@/components/settings/settings-layout";
import { OnboardingGuard } from "@/lib/onboarding-guard";

/**
 * Settings chrome. Same dashboard shell (sidebar + main content) so the
 * user keeps their place when navigating into a settings page. Inside
 * the 960-wide content area we render the inner two-column settings
 * layout (settings nav + content).
 *
 * OnboardingGuard mode="require-complete" — a user who hasn't finished
 * onboarding shouldn't be poking at settings yet.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedShell>
      <div className="mx-auto w-full max-w-[960px] flex-1 px-6 py-8 sm:px-8"> 
      <OnboardingGuard mode="require-complete">
        <SettingsLayoutComponent>{children}</SettingsLayoutComponent>
      </OnboardingGuard>
      </div> 
    </ProtectedShell>
  );
}
