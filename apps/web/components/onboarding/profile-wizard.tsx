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
import { api } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";

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
];

const STEP_COUNT = 4;

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
  const { refresh } = useAuth();
  const [step, setStep] = React.useState(1);
  const [state, setState] = React.useState<WizardState>(INITIAL_STATE);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

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
    setIsSubmitting(true);
    try {
      const payload: UpdateProfileRequest = {
        niche: state.niche,
        uploadFrequency: state.frequency,
        primaryGoal: state.goal,
        ...(state.displayName.trim().length > 0
          ? { displayName: state.displayName.trim() }
          : {}),
      };
      await api.submitOnboardingProfile(payload);
      // Re-fetch /api/auth/me so AuthProvider reflects the new
      // onboardingCompletedAt (and updated profile). Without this the
      // dashboard's OnboardingGuard reads the stale `false` and bounces
      // the user straight back to /onboarding/profile.
      await refresh();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't save your profile. Try again.",
      );
      setIsSubmitting(false);
    }
  };

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
          disabled={!canAdvance || isSubmitting}
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
    default:
      return "";
  }
}
