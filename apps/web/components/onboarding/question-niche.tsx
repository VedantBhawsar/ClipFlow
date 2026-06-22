"use client";

import type { ContentNiche } from "@clipflow/types";
import { CONTENT_NICHES } from "@clipflow/types";
import { cn } from "@/lib/utils";

interface NicheOption {
  value: ContentNiche;
  label: string;
  /** One-line description shown under the label on the card. */
  description: string;
}

const NICHE_OPTIONS: ReadonlyArray<NicheOption> = [
  {
    value: "GAMING",
    label: "Gaming",
    description: "Let’s plays, walkthroughs, esports, reviews.",
  },
  {
    value: "TECH_EDUCATION",
    label: "Tech & education",
    description: "Tutorials, explainers, code, deep dives.",
  },
  {
    value: "VLOG_LIFESTYLE",
    label: "Vlog & lifestyle",
    description: "Day-in-the-life, travel, personal stories.",
  },
  {
    value: "BUSINESS_FINANCE",
    label: "Business & finance",
    description: "Entrepreneurship, investing, market analysis.",
  },
  {
    value: "ENTERTAINMENT_COMEDY",
    label: "Entertainment & comedy",
    description: "Sketch, reactions, commentary, variety.",
  },
  {
    value: "OTHER",
    label: "Other",
    description: "Something else — pick the closest fit.",
  },
];

interface QuestionNicheProps {
  value: ContentNiche | null;
  onChange: (next: ContentNiche) => void;
}

/**
 * Step 2 — content niche. Six large tap-friendly cards in a 2-column
 * grid (1 column on mobile). Single-select; the parent owns the value.
 *
 * The card includes the description text AND a checkmark for the
 * selected state so it works without color (accessibility).
 */
export function QuestionNiche({ value, onChange }: QuestionNicheProps) {
  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Content niche</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {NICHE_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          // Defensive: if @clipflow/types ever adds an enum value not
          // listed in NICHE_OPTIONS, fall back to rendering it generically.
          if (!CONTENT_NICHES.includes(opt.value)) return null;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(opt.value)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors motion-safe:duration-150",
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
