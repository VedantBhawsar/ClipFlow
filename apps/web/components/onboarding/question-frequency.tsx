"use client";

import type { UploadFrequency } from "@clipflow/types";
import { UPLOAD_FREQUENCIES } from "@clipflow/types";
import { cn } from "@/lib/utils";

interface FrequencyOption {
  value: UploadFrequency;
  label: string;
  description: string;
}

const FREQUENCY_OPTIONS: ReadonlyArray<FrequencyOption> = [
  { value: "ONE_TO_FOUR", label: "1–4 per month", description: "A few videos, no fixed cadence." },
  { value: "FIVE_TO_TEN", label: "5–10 per month", description: "Roughly weekly or twice-weekly." },
  { value: "ELEVEN_TO_TWENTY", label: "11–20 per month", description: "A few times each week." },
  { value: "TWENTY_PLUS", label: "20+ per month", description: "Daily or near-daily publishing." },
];

interface QuestionFrequencyProps {
  value: UploadFrequency | null;
  onChange: (next: UploadFrequency) => void;
}

/**
 * Step 3 — upload frequency. Four single-select cards stacked vertically
 * on mobile, in a 2x2 grid on sm+. Drives the recommended-plan suggestion
 * surfaced later on the billing screen.
 */
export function QuestionFrequency({ value, onChange }: QuestionFrequencyProps) {
  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Upload frequency</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FREQUENCY_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          if (!UPLOAD_FREQUENCIES.includes(opt.value)) return null;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors motion-safe:duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-foreground/30 hover:bg-muted/40",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                {isSelected ? (
                  <span className="h-2 w-2 rounded-full bg-current" />
                ) : null}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {opt.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
