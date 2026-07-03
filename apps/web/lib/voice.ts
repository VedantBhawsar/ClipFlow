/**
 * User-facing formatters (Voice + Copy, Design.md Section 4).
 *
 * Plain active-voice labels, no jargon, no abbreviations. Every enum
 * value has a text label — the UI never signals state by color alone.
 *
 * Originally inlined in the video detail page; lifted here once the
 * Publish sheet needed the same privacy formatter. Future callers
 * (e.g. dashboard row, settings page) can reach for these without
 * each one re-implementing the switch.
 */

import type {
  VideoCommentPolicy,
  VideoLicense,
  VideoPrivacyStatus,
} from "@clipflow/types";

/**
 * "Public — anyone can watch" / "Unlisted — only people with the link"
 * / "Private — only you". Accepts either the typed enum or a raw
 * string (the `Video` DTO widens `privacyStatus` to `string`; the
 * service writes the Prisma enum value, which serializes to a string).
 */
export function formatPrivacy(p: VideoPrivacyStatus | string): string {
  switch (p) {
    case "public":
      return "Public — anyone can watch";
    case "unlisted":
      return "Unlisted — only people with the link";
    case "private":
      return "Private — only you";
    default:
      return String(p);
  }
}

/**
 * "Everyone can comment" / "All comments held for review" / "Comments off".
 */
export function formatCommentPolicy(p: VideoCommentPolicy): string {
  switch (p) {
    case "allowAll":
      return "Everyone can comment";
    case "holdAll":
      return "All comments held for review";
    case "disable":
      return "Comments off";
    default:
      return String(p);
  }
}

/**
 * "Standard YouTube License" / "Creative Commons — Attribution".
 */
export function formatLicense(l: VideoLicense): string {
  switch (l) {
    case "standard":
      return "Standard YouTube License";
    case "creativeCommon":
      return "Creative Commons — Attribution";
    default:
      return String(l);
  }
}

/**
 * Render a byte count using the unit YouTube Studio shows. 1 decimal
 * for KB / MB / GB; raw bytes under 1 KB.
 */
export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/**
 * Render a duration in seconds as `M:SS` (under an hour) or `H:MM:SS`.
 * Rounds to the nearest second — fractional second precision is noise
 * for the creator-facing UI.
 */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
