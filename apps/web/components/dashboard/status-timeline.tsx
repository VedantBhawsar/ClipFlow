"use client";

import { cn } from "@/lib/utils";

/**
 * Visual pipeline stages shown in the timeline strip — the signature
 * element from Design.md Section 2.
 *
 * These are a user-facing consolidation of the more granular backend
 * `VideoStatus` enum. Multiple backend statuses collapse into a single
 * visual bucket — for example EXTRACTING / TRANSCRIBING / GENERATING
 * all show as "Processing" because they run sequentially without user
 * intervention.
 *
 * Failed states (PUBLISH_FAILED, FAILED) are surfaced via `hasError`
 * on the parent — the current segment then renders in `--status-error`
 * rather than in the neutral processing color, so the failure is
 * legible from the strip alone.
 */
export type TimelineStatus =
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "scheduled"
  | "published";

const STAGES: ReadonlyArray<{
  id: TimelineStatus;
  label: string;
  /** Sub-label surfaced when this stage is *current* (Design.md — every
   *  status carries a text label, never color alone). */
  activeLabel: string;
}> = [
  { id: "uploaded", label: "Uploaded", activeLabel: "Uploaded" },
  { id: "processing", label: "Transcribing", activeLabel: "Transcribing" },
  {
    id: "ready_for_review",
    label: "Chapters & thumbnails",
    activeLabel: "Ready for review",
  },
  { id: "scheduled", label: "Scheduled", activeLabel: "Scheduled" },
  { id: "published", label: "Published", activeLabel: "Published" },
];

interface StatusTimelineProps {
  status: TimelineStatus;
  /**
   * Override the auto-inferred "current stage". Useful when the
   * backend sub-stage (transcribing vs. generating) collapses into the
   * same "processing" visual bucket but the caller wants to show a
   * specific stage as current.
   */
  currentStage?: TimelineStatus;
  /**
   * Render the current segment in `--status-error` rather than
   * `--status-processing` — used when the row has failed at its current
   * stage. Design.md: color-only signalling is disallowed, so the
   * caller should also render a text label ("Publish failed", etc.)
   * near the strip.
   */
  hasError?: boolean;
  /** Compact / expanded density. `compact` drops the stage labels — used
   *  in tight rows (dashboard list). The detail page always uses the
   *  default (labels visible). */
  hyasError?: boolean;
  size?: "default" | "compact";
  className?: string;
}

/**
 * The signature element from Design.md — five horizontal segments
 * representing where a video is in the pipeline. The current segment is
 * filled in the relevant status color and pulses subtly (motion-safe).
 *
 * Designed so a returning user can read the state at a glance, anywhere
 * a video appears — dashboard row, detail page, list rows.
 *
 * Accessibility: each segment has a text label and a visible filled
 * vs. outline treatment that doesn't rely on color alone.
 */
export function StatusTimeline({
  status,
  currentStage,
  hasError = false,
  size = "default",
  className,
}: StatusTimelineProps) {
  // Map the supplied status to the timeline index. Unknown statuses
  // land on "uploaded" (the leftmost segment) so the row still renders
  // rather than going blank — better to show a slightly wrong stage
  // than no stage at all, and the parent should fall back to a badge
  // for genuinely unknown states.
  const resolvedIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.id === (currentStage ?? status)),
  );

  const compact = size === "compact";

  return (
    <ol
      className={cn("flex w-full items-start gap-1.5", className)}
      aria-label="Pipeline status"
    >
      {STAGES.map((stage, index) => {
        const isDone = index < resolvedIndex;
        const isCurrent = index === resolvedIndex;
        const isFuture = index > resolvedIndex;

        const barClass = cn(
          "block h-2 w-full rounded-full transition-colors",
          isDone && "bg-[color:var(--status-ready)]",
          isCurrent &&
            !hasError &&
            "bg-[color:var(--status-processing)] motion-safe:animate-pulse",
          isCurrent && hasError && "bg-[color:var(--status-error)]",
          isFuture &&
            "border border-[color:var(--line)] bg-transparent",
        );

        return (
          <li
            key={stage.id}
            className="flex flex-1 flex-col gap-1.5 min-w-0"
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className={barClass} aria-hidden="true" />
            {!compact ? (
              <span
                className={cn(
                  "truncate text-[11px] leading-tight",
                  isCurrent
                    ? "font-medium text-[color:var(--ink)]"
                    : isDone
                      ? "text-[color:var(--ink)]/80"
                      : "text-[color:var(--ink-muted)]",
                )}
              >
                {isCurrent ? stage.activeLabel : stage.label}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
