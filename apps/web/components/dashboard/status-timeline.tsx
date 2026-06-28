"use client";

import { cn } from "@/lib/utils";

/**
 * Visual pipeline stages shown in the timeline strip.
 *
 * These are a user-facing consolidation of the more granular backend
 * `VideoStatus` enum. Multiple backend statuses collapse into a single
 * visual bucket — for example EXTRACTING / TRANSCRIBING / GENERATING
 * all show as "Processing" because they run sequentially without user
 * intervention.
 *
 * Failed states (PUBLISH_FAILED, FAILED) are not represented as their
 * own stage — the card/detail page shows the failure reason, error
 * styling, and SSE error events instead.
 */
export type TimelineStatus =
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "scheduled"
  | "published";

const STAGES: ReadonlyArray<{ id: TimelineStatus; label: string }> = [
  { id: "uploaded", label: "Uploaded" },
  { id: "processing", label: "Processing" },
  { id: "ready_for_review", label: "Ready for review" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
];

interface StatusTimelineProps {
  status: TimelineStatus;
  /**
   * Override the auto-inferred "current stage". Mostly useful for tests
   * and for showing an in-progress sub-stage (e.g. "transcribing" while
   * thumbnails also generate in parallel — Schema.md calls this out).
   */
  currentStage?: TimelineStatus;
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

  return (
    <ol
      className={cn("flex w-full items-center gap-1", className)}
      aria-label="Pipeline status"
    >
      {STAGES.map((stage, index) => {
        const isDone = index < resolvedIndex;
        const isCurrent = index === resolvedIndex;
        const dotClass = isDone
          ? "bg-status-ready"
          : isCurrent
            ? "bg-status-processing motion-safe:animate-pulse"
            : "border border-border bg-background";
        return (
          <li
            key={stage.id}
            className="flex flex-1 flex-col gap-1"
            aria-current={isCurrent ? "step" : undefined}
          >
            <span
              className={cn(
                "block h-1.5 w-full rounded-full",
                dotClass,
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "truncate text-[11px] leading-tight",
                isCurrent
                  ? "font-medium text-foreground"
                  : isDone
                    ? "text-foreground/70"
                    : "text-muted-foreground",
              )}
            >
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
