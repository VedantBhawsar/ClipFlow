"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type {
  ContentNiche,
  PrimaryGoal,
  UpdateProfileRequest,
  UploadFrequency,
} from "@clipflow/types";

import { Button } from "@/components/ui/button";
import { ProgressDots } from "@/components/onboarding/progress-dots";
import { QuestionNiche } from "@/components/onboarding/question-niche";
import { QuestionFrequency } from "@/components/onboarding/question-frequency";
import { QuestionGoal } from "@/components/onboarding/question-goal";
import { QuestionDisplayName } from "@/components/onboarding/question-display-name";
import { QuestionThumbnailStyle } from "@/components/onboarding/question-thumbnail-style";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";
import { useSession } from "next-auth/react";

interface WizardState {
  displayName: string;
  niche: ContentNiche | null;
  frequency: UploadFrequency | null;
  goal: PrimaryGoal | null;
}

const INITIAL_STATE: WizardState = {
  displayName: "",
  niche: null,
  frequency: null,
  goal: null,
};

const STEP_LABELS = [
  "Your channel",
  "Content niche",
  "Upload frequency",
  "Primary goal",
  "Thumbnail style",
];

const STEP_COUNT = 5;

/**
 * Four-step wizard for the onboarding profile questions. Each step owns
 * one piece of state; the final step submits the full payload in the
 * shape the backend expects (UpdateProfileRequest).
 *
 * Back/Next navigation is local — no state is committed until the final
 * submit. The display name step is intentionally optional (AppFlow.md
 * calls this the "medium" tier: more than name-only, well short of a
 * survey), so its Next button is enabled even when the field is empty.
 */
export function ProfileWizard() {
  const router = useRouter();
  const { submit } = useUpdateProfile();
  const { update } = useSession();
  const [step, setStep] = React.useState(1);
  const [state, setState] = React.useState<WizardState>(INITIAL_STATE);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Step 5 only renders when the user has a connected YouTube channel.
  // When not connected, the wizard effectively ends at step 4 — the
  // dots still show 5 but the question panel is replaced by a "skip"
  // hint so the user understands they can finish without YouTube.
  const connectionQuery = useYouTubeConnection();
  const youtubeConnected = connectionQuery.data?.status === "connected";

  const canAdvance = (() => {
    if (step === 2) return state.niche !== null;
    if (step === 3) return state.frequency !== null;
    if (step === 4) return state.goal !== null;
    return true;
  })();

  const handleSubmit = async () => {
    if (state.niche === null || state.frequency === null || state.goal === null) {
      return;
    }
    setSubmitError(null);
    try {
      const trimmedDisplayName = state.displayName.trim();
      const payload: UpdateProfileRequest = {
        niche: state.niche,
        uploadFrequency: state.frequency,
        primaryGoal: state.goal,
        ...(trimmedDisplayName.length > 0
          ? { displayName: trimmedDisplayName }
          : {}),
      };
      await submit.mutateAsync(payload);
      // Flip the session flags so `<OnboardingGuard>` (which reads
      // from `useSession()` directly) routes us to /dashboard on the
      // next render instead of bouncing back to /onboarding/profile.
      // Passing the new display name means the dashboard chrome can
      // greet by name without a settings refetch.
      await update({
        onboardingCompleted: true,
        displayName: trimmedDisplayName.length > 0 ? trimmedDisplayName : null,
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't save your profile. Try again.",
      );
    }
  };

  const isSubmitting = submit.isPending;

  const handleNext = () => {
    if (step < STEP_COUNT) {
      setStep((s) => s + 1);
      return;
    }
    void handleSubmit();
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  return (
    <div className="space-y-8">
      <ProgressDots current={step} total={STEP_COUNT} labels={STEP_LABELS} />

      {submitError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </div>
      ) : null}

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {stepHeadline(step)}
        </h1>
        <p className="text-sm text-muted-foreground">{stepSubhead(step)}</p>
      </div>

      <div className="min-h-[260px]">
        {step === 1 ? (
          <QuestionDisplayName
            value={state.displayName}
            onChange={(v) => setState((s) => ({ ...s, displayName: v }))}
            onSkip={() => setState((s) => ({ ...s, displayName: "" }))}
          />
        ) : null}
        {step === 2 ? (
          <QuestionNiche
            value={state.niche}
            onChange={(v) => setState((s) => ({ ...s, niche: v }))}
          />
        ) : null}
        {step === 3 ? (
          <QuestionFrequency
            value={state.frequency}
            onChange={(v) => setState((s) => ({ ...s, frequency: v }))}
          />
        ) : null}
        {step === 4 ? (
          <QuestionGoal
            value={state.goal}
            onChange={(v) => setState((s) => ({ ...s, goal: v }))}
          />
        ) : null}
        {step === 5 && youtubeConnected ? (
          <QuestionThumbnailStyle
            variant="onboarding"
            onComplete={() => void handleSubmit()}
          />
        ) : null}
        {step === 5 && !youtubeConnected && !connectionQuery.isLoading ? (
          <div className="space-y-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            <p>
              Connect your YouTube channel to pick thumbnails for personalized
              style analysis. You can do this anytime from your dashboard.
            </p>
            <Button type="button" variant="ghost" onClick={() => void handleSubmit()}>
              Skip — go to dashboard
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={handleBack}
          disabled={step === 1 || isSubmitting}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance || isSubmitting || (step === 5 && !youtubeConnected)}
          aria-hidden={step === 5 && youtubeConnected ? "true" : undefined}
          tabIndex={step === 5 && youtubeConnected ? -1 : 0}
          className={step === 5 && youtubeConnected ? "sr-only" : undefined}
        >
          {step === STEP_COUNT
            ? isSubmitting
              ? "Saving…"
              : "Finish setup"
            : "Next"}
          {step === STEP_COUNT ? null : <ArrowRight aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

function stepHeadline(step: number): string {
  switch (step) {
    case 1:
      return "What should we call your channel?";
    case 2:
      return "What's your content niche?";
    case 3:
      return "How often do you upload?";
    case 4:
      return "What's your main goal right now?";
    case 5:
      return "Personalize your thumbnails";
    default:
      return "";
  }
}

function stepSubhead(step: number): string {
  switch (step) {
    case 1:
      return "Optional — we use this to personalize your dashboard.";
    case 2:
      return "This helps us tune thumbnail and chapter generation to fit your content.";
    case 3:
      return "We'll use this to suggest a plan that fits your volume — never auto-charged.";
    case 4:
      return "Pick the one that would make the biggest difference this quarter.";
    case 5:
      return "Pick a few of your recent thumbnails so generated thumbnails match your channel style.";
    default:
      return "";
  }
}
