import type { Metadata } from "next";
import { Check } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/auth/google-button";
import { ProtectedShell } from "@/components/shared/protected-shell";
import { OnboardingGuard } from "@/lib/onboarding-guard";

export const metadata: Metadata = {
  title: "Connect your channel — ClipFlow",
  description: "Connect your YouTube channel to ClipFlow.",
};

/**
 * Pre-OAuth landing page.
 *
 * Voice per Design.md: "Connect your channel, not 'Authorize OAuth scope'."
 * The page states what ClipFlow will do, what it won't do, and asks for
 * explicit consent before the Google OAuth popup opens.
 *
 * OnboardingGuard (mode="require-complete") sits inside ProtectedShell so
 * users who haven't answered the four setup questions get bounced to
 * /onboarding/profile first — they shouldn't be making channel-connection
 * decisions before ClipFlow knows what kind of creator they are.
 *
 * For v1 the actual OAuth round-trip isn't wired yet, so the primary CTA
 * routes through the same "coming soon" toast path used elsewhere; the
 * page is still real, focused copy, not a placeholder.
 */
export default function YouTubeConnectPage() {
  return (
    <ProtectedShell>
      <OnboardingGuard mode="require-complete">
        <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
        <Card className="w-full max-w-[520px]">
          <CardHeader>
            <CardTitle className="text-xl">
              Connect your YouTube channel
            </CardTitle>
            <CardDescription>
              You&apos;ll sign in with Google and grant ClipFlow permission to
              publish on your behalf. You stay in control of every video.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section aria-labelledby="cf-will-do" className="space-y-2">
              <h2 id="cf-will-do" className="text-sm font-semibold text-foreground">
                What ClipFlow will do
              </h2>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-status-ready"
                    aria-hidden="true"
                  />
                  <span>
                    Publish videos on your behalf at the time you schedule.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-status-ready"
                    aria-hidden="true"
                  />
                  <span>
                    Read your channel info so we can show it in the dashboard.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-status-ready"
                    aria-hidden="true"
                  />
                  <span>
                    Read your channel analytics (this feature ships in v1.5).
                  </span>
                </li>
              </ul>
            </section>

            <section aria-labelledby="cf-wont-do" className="space-y-2">
              <h2 id="cf-wont-do" className="text-sm font-semibold text-foreground">
                What ClipFlow won&apos;t do
              </h2>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>Post a video without your explicit approval.</li>
                <li>Edit or delete videos you&apos;ve already published.</li>
                <li>Share your channel data with third parties.</li>
              </ul>
            </section>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
              <Button asChild variant="ghost">
                <a href="/dashboard">Back to dashboard</a>
              </Button>
              <GoogleButton label="Continue with Google" />
            </div>
          </CardContent>
        </Card>
      </main>
      </OnboardingGuard>
    </ProtectedShell>
  );
}
