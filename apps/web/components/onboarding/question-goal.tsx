"use client";

import type { PrimaryGoal } from "@clipflow/types";
import { PRIMARY_GOALS } from "@clipflow/types";
import { cn } from "@/lib/utils";

interface GoalOption {
  value: PrimaryGoal;
  label: string;
  description: string;
}

const GOAL_OPTIONS: ReadonlyArray<GoalOption> = [
  {
    value: "SAVE_TIME_EDITING",
    label: "Save time editing",
    description: "Cut the post-production grind for every video.",
  },
  {
    value: "BETTER_THUMBNAILS_CTR",
    label: "Better thumbnails & CTR",
    description: "Get more clicks without a designer on call.",
  },
  {
    value: "CONSISTENT_SCHEDULE",
    label: "Consistent posting schedule",
    description: "Publish reliably without manual juggling.",
  },
  {
    value: "GROW_VIEWS",
    label: "Grow views",
    description: "Get more reach and subscribers over time.",
  },
];

interface QuestionGoalProps {
  value: PrimaryGoal | null;
  onChange: (next: PrimaryGoal) => void;
}

/**
 * Step 4 — primary goal. Four single-select cards. Drives which feature
 * ClipFlow surfaces most prominently on the dashboard for this user
 * (see Schema.md note on primaryGoal).
 */
export function QuestionGoal({ value, onChange }: QuestionGoalProps) {
  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Primary goal</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GOAL_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          if (!PRIMARY_GOALS.includes(opt.value)) return null;
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
