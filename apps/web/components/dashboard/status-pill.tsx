import { cn } from "@/lib/utils";
import type { VideoStatus } from "@clipflow/types";

import { STATUS_LABEL, STATUS_TONE, type StatusTone } from "@/lib/video-status";

/**
 * Status chip using Design.md's `--status-*` tokens — no ad-hoc colors.
 * Text label is always present so state is not communicated by color
 * alone (Design.md Section 6).
 *
 * Used in:
 *  - the dashboard video row (`<VideoCard>`)
 *  - the video detail page header (the inline `StatusPill` was lifted
 *    here so both surfaces share the same paint)
 *  - any future surface that needs to render a video's status
 *
 * The small dot on the left pulses (motion-safe) when the tone is
 * "processing" — gives an at-a-glance "this is moving" signal without
 * resorting to a generic spinner.
 */
export function StatusPill({ status }: { status: VideoStatus }) {
  const tone: StatusTone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        TONE_CLASS[tone],
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full bg-current",
          tone === "processing" && "motion-safe:animate-pulse",
        )}
        aria-hidden="true"
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

const TONE_CLASS: Record<StatusTone, string> = {
  processing: "bg-[color:var(--status-processing)]/12 text-[color:var(--status-processing)]",
  ready: "bg-[color:var(--status-ready)]/12 text-[color:var(--status-ready)]",
  scheduled: "bg-[color:var(--status-scheduled)]/12 text-[color:var(--status-scheduled)]",
  error: "bg-[color:var(--status-error)]/12 text-[color:var(--status-error)]",
  neutral: "bg-[color:var(--muted)] text-[color:var(--ink-muted)]",
};
