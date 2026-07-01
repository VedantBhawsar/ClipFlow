import { Check, Circle, Loader2 } from "lucide-react";
import type { Video } from "@clipflow/types";

import { cn } from "@/lib/utils";

/**
 * Sub-stage breakdown for the "Processing" bucket of the 5-stage
 * `StatusTimeline`. Multiple backend statuses (EXTRACTING /
 * TRANSCRIBING / GENERATING) collapse into the single visual
 * "Processing" segment — but the user actually moves through three
 * distinct steps inside that bucket, and the detail page should make
 * that visible. Without this list, "Processing" reads as a black box:
 * is the video 5% done or 95% done? Is the worker on audio or
 * thumbnails?
 *
 * Renders nothing for statuses that aren't inside (or past) the
 * Processing bucket (UPLOADED, READY, FAILED, PUBLISH_FAILED) — the
 * 5-stage timeline is enough on its own there.
 */

interface ProcessingSubStepsProps {
  status: Video["status"];
  className?: string;
}

interface SubStage {
  /** Short label shown next to the state icon. */
  label: string;
  /** One-sentence explanation. Surfaces below the list when the step
   *  is the current one (so the user learns what we're doing without
   *  having to hover / tap). */
  description: string;
}

const SUB_STAGES: ReadonlyArray<SubStage> = [
  {
    label: "Extracting audio + candidate frames",
    description:
      "Pulling the audio track and a set of thumbnail candidate frames from your video.",
  },
  {
    label: "Transcribing audio",
    description:
      "Converting the extracted audio into text so we can detect chapter boundaries.",
  },
  {
    label: "Generating chapters + thumbnails",
    description:
      "Drafting chapter timestamps and picking the strongest thumbnail candidates.",
  },
];

interface SubStageState {
  /** Index of the running sub-stage, or -1 if all complete. */
  currentIndex: number;
  /** Number of sub-stages that are fully done. */
  completedUpTo: number;
  /** Whether to render the component at all. */
  visible: boolean;
  /** Description to surface below the list (the current step's copy). */
  currentDescription: string | null;
}

/**
 * Map backend status → sub-stage display state.
 *
 * READY_FOR_REVIEW / SCHEDULED / PUBLISHING / PUBLISHED all imply the
 * three Processing sub-stages finished — show them all checked and
 * drop the description paragraph (there's no "current" step inside
 * Processing anymore).
 *
 * UPLOADED / READY → user hasn't kicked the pipeline off yet; hide.
 * FAILED / PUBLISH_FAILED → the parent timeline + failureReason text
 * already communicate the failure; rendering a half-checked sub-stage
 * list would be misleading because we don't know which step the row
 * was on when it died. Hide.
 */
function getSubStageState(status: Video["status"]): SubStageState {
  switch (status) {
    case "EXTRACTING":
      return {
        currentIndex: 0,
        completedUpTo: 0,
        visible: true,
        currentDescription: SUB_STAGES[0]!.description,
      };
    case "TRANSCRIBING":
      return {
        currentIndex: 1,
        completedUpTo: 1,
        visible: true,
        currentDescription: SUB_STAGES[1]!.description,
      };
    case "GENERATING":
      return {
        currentIndex: 2,
        completedUpTo: 2,
        visible: true,
        currentDescription: SUB_STAGES[2]!.description,
      };
    case "READY_FOR_REVIEW":
    case "SCHEDULED":
    case "PUBLISHING":
    case "PUBLISHED":
      return {
        currentIndex: -1,
        completedUpTo: SUB_STAGES.length,
        visible: true,
        currentDescription: null,
      };
    default:
      return {
        currentIndex: -1,
        completedUpTo: 0,
        visible: false,
        currentDescription: null,
      };
  }
}

export function ProcessingSubSteps({
  status,
  className,
}: ProcessingSubStepsProps) {
  const state = getSubStageState(status);
  if (!state.visible) return null;

  return (
    <div className={cn("mt-5 space-y-2", className)}>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Steps inside &quot;Processing&quot;
      </h3>
      <ol className="space-y-1.5" aria-label="Processing sub-stages">
        {SUB_STAGES.map((stage, index) => {
          const isDone = index < state.completedUpTo;
          const isCurrent = index === state.currentIndex;
          return (
            <li
              key={stage.label}
              className="flex items-start gap-2 text-sm"
              aria-current={isCurrent ? "step" : undefined}
            >
              <SubStageIcon done={isDone} current={isCurrent} />
              <span
                className={cn(
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
      {state.currentDescription ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {currentStepLabel(state.currentIndex)} — {state.currentDescription}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Lower-case the first word of the sub-stage label for natural prose:
 * "Transcribing audio" → "Transcribing". Used to prefix the
 * description paragraph ("Transcribing — converting the audio...").
 */
function currentStepLabel(index: number): string {
  const label = SUB_STAGES[index]?.label ?? "";
  // Cut at the first " + " or " " boundary so we keep "Transcribing"
  // from "Transcribing audio", "Extracting" from "Extracting audio +
  // candidate frames", etc.
  const spaceIndex = label.indexOf(" ");
  return spaceIndex === -1 ? label : label.slice(0, spaceIndex);
}

function SubStageIcon({
  done,
  current,
}: {
  done: boolean;
  current: boolean;
}) {
  if (done) {
    return (
      <Check
        className="mt-0.5 h-4 w-4 shrink-0 text-status-ready"
        aria-hidden="true"
      />
    );
  }
  if (current) {
    return (
      <Loader2
        className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary"
        aria-hidden="true"
      />
    );
  }
  return (
    <Circle
      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40"
      aria-hidden="true"
    />
  );
}