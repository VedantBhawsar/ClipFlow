import type { Metadata } from "next";

import { QuestionThumbnailStyle } from "@/components/onboarding/question-thumbnail-style";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Personalize thumbnails — ClipFlow",
  description:
    "Pick thumbnails from your YouTube channel so ClipFlow can match your style.",
};

/**
 * Standalone mount of the wizard's step 5 for users who finished the
 * onboarding flow but want to personalize thumbnails separately. The
 * `/onboarding/layout.tsx` already gates this with
 * `<OnboardingGuard mode="require-incomplete">` so completed users
 * get redirected to /dashboard (this means re-picking should actually
 * go to `/dashboard/thumbnail-style` for already-onboarded users).
 *
 * We mount the wizard step here as a no-progress-step page so that if
 * someone navigates here from the wizard's "skip" link, they see a
 * consistent interface.
 */
export default function OnboardingThumbnailStylePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Personalize your thumbnails
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a few of your recent thumbnails and ClipFlow will learn your
          style. New videos will get thumbnails that match.
        </p>
      </div>
      <QuestionThumbnailStyle variant="onboarding" />
      <div className="pt-2">
        <Button asChild variant="ghost">
          <Link href="/dashboard">Skip — go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}