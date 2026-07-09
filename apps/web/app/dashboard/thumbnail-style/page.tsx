import type { Metadata } from "next";

import { QuestionThumbnailStyle } from "@/components/onboarding/question-thumbnail-style";

export const metadata: Metadata = {
  title: "Personalize thumbnails — ClipFlow",
  description:
    "Pick a few of your recent thumbnails and ClipFlow will learn your style.",
};

/**
 * Full page (not a Dialog) for already-onboarded users who want to
 * (re)personalize their thumbnails. The dashboard layout wraps this in
 * `<ProtectedShell>` and `<OnboardingGuard mode="require-complete">`
 * automatically — no extra guards needed.
 *
 * The CTA on `/dashboard/settings/connected` routes here for users
 * without a `ChannelThumbnailStyle` row yet. For users who want to
 * refresh, the same component is mounted inside a `<Dialog>` on the
 * settings page.
 */
export default function DashboardThumbnailStylePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Personalize thumbnails
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a few of your recent thumbnails and ClipFlow will learn your
          style. New videos will get thumbnails that match.
        </p>
      </div>
      <QuestionThumbnailStyle variant="settings" />
    </div>
  );
}