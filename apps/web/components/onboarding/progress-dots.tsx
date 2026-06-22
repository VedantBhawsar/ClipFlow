"use client";

import { cn } from "@/lib/utils";

interface ProgressDotsProps {
  current: number; // 1-indexed
  total: number;
  /** Optional labels per step; shown above the dots when provided. */
  labels?: ReadonlyArray<string>;
}

/**
 * The onboarding stepper. A row of dots with the current one filled;
 * past dots are marked done (filled with foreground), future dots are
 * outlined. A numeric "step N of M" sits to the right for screen readers
 * and as a redundant textual cue.
 *
 * Motion: dots fade in their new state on step changes, gated on
 * `motion-safe:` per Design.md Section 5.
 */
export function ProgressDots({ current, total, labels }: ProgressDotsProps) {
  return (
    <div
      className="flex flex-col gap-2"
      role="group"
      aria-label={`Step ${current} of ${total}`}
    >
      <div className="flex items-center gap-2">
        {Array.from({ length: total }).map((_, i) => {
          const step = i + 1;
          const state =
            step < current ? "done" : step === current ? "current" : "future";
          return (
            <span
              key={step}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors motion-safe:duration-200 motion-safe:ease-in-out",
                state === "done" && "bg-foreground/60",
                state === "current" && "bg-primary",
                state === "future" && "bg-border",
              )}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span aria-live="polite">
          Step {current} of {total}
          {labels && labels[current - 1] ? (
            <span className="text-foreground"> · {labels[current - 1]}</span>
          ) : null}
        </span>
        {labels && labels[current - 1] ? (
          <span className="hidden text-muted-foreground sm:block">
            {labels.filter(Boolean).length} questions
          </span>
        ) : null}
      </div>
    </div>
  );
}
