/**
 * Single source of truth for video-status presentation.
 *
 * Multiple surfaces — the dashboard row, the published library, the
 * video detail page, and the new stats summary — all need to map the
 * backend `VideoStatus` to user-facing copy + a visual tone. Before
 * this module each surface shipped its own `STATUS_LABEL` /
 * `STATUS_TONE` / `mapStatus` declarations and the visuals drifted
 * (different raw Tailwind colors, different copy).
 *
 * Per Design.md:
 *  - Every status is communicated by color AND a text label.
 *  - Tones pull from the `--status-*` tokens in `app/globals.css`;
 *    no ad-hoc colors.
 *  - The 5-segment status timeline is the signature visual element;
 *    the backend's 11 statuses collapse into those 5 buckets.
 *
 * The dashboard's `IN_FLIGHT_STATUSES` set (used by both the
 * `useVideoSSE` safety-net polling and the new stats row) lives here
 * too — the rule "what counts as in flight" is shared across
 * components and belongs in one place.
 */

import type { VideoStatus } from "@clipflow/types";
import type { TimelineStatus } from "@/components/dashboard/status-timeline";

/**
 * Backend statuses where the pipeline is still in motion. Any of
 * these count as "in flight" for the safety-net polling fallback
 * (if at least one row matches, the dashboard refetches every 15s
 * so a missed SSE event can't strand a row on its old status) and
 * for the `<DashboardStats />` "In flight" count.
 */
export const IN_FLIGHT_STATUSES: ReadonlySet<VideoStatus> = new Set([
  "UPLOADED",
  "READY",
  "EXTRACTING",
  "TRANSCRIBING",
  "GENERATING",
  "READY_FOR_REVIEW",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISH_FAILED",
  "FAILED",
]);

/** Statuses that represent truly finished work. */
export const FINAL_STATUSES: ReadonlySet<VideoStatus> = new Set([
  "PUBLISHED",
]);

/**
 * User-facing labels for each backend status. Voice per Design.md
 * Section 4 — active voice, plain verbs, no jargon. Every status
 * has a text label; never signal state by color alone.
 */
export const STATUS_LABEL: Record<VideoStatus, string> = {
  UPLOADED: "Awaiting upload",
  READY: "Ready to process",
  EXTRACTING: "Extracting audio & frames",
  TRANSCRIBING: "Transcribing",
  GENERATING: "Generating chapters & thumbnails",
  READY_FOR_REVIEW: "Ready for your review",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  PUBLISH_FAILED: "Publish failed",
  FAILED: "Processing failed",
};

/**
 * Which `--status-*` token drives the chip / pill. Single source of
 * truth so the dashboard row, the published card, the detail page
 * header, and the new stats row all paint status the same way.
 */
export type StatusTone =
  | "processing"
  | "ready"
  | "scheduled"
  | "error"
  | "neutral";

export const STATUS_TONE: Record<VideoStatus, StatusTone> = {
  UPLOADED: "neutral",
  READY: "neutral",
  EXTRACTING: "processing",
  TRANSCRIBING: "processing",
  GENERATING: "processing",
  READY_FOR_REVIEW: "ready",
  SCHEDULED: "scheduled",
  PUBLISHING: "processing",
  PUBLISHED: "ready",
  PUBLISH_FAILED: "error",
  FAILED: "error",
};

/**
 * Map a backend status onto the 5-segment timeline strip. Multiple
 * backend statuses collapse into a single visual bucket where the
 * distinction isn't meaningful to the user (EXTRACTING / TRANSCRIBING
 * / GENERATING all show as "Processing" because they run sequentially
 * without user intervention).
 *
 * Failed statuses land on the stage where the failure occurred so the
 * strip still reflects progress; the error is communicated via the
 * surrounding card border + failure reason text, not the strip.
 */
export function mapTimelineStatus(status: VideoStatus): TimelineStatus {
  switch (status) {
    case "UPLOADED":
    case "READY":
      return "uploaded";
    case "EXTRACTING":
    case "TRANSCRIBING":
    case "GENERATING":
      return "processing";
    case "READY_FOR_REVIEW":
      return "ready_for_review";
    case "SCHEDULED":
    case "PUBLISHING":
    case "PUBLISH_FAILED":
      return "scheduled";
    case "PUBLISHED":
      return "published";
    case "FAILED":
      return "processing";
  }
}

/** Whether the row has hit a non-recoverable state and needs attention. */
export function isFailedStatus(status: VideoStatus): boolean {
  return status === "FAILED" || status === "PUBLISH_FAILED";
}
