/**
 * Small formatting helpers used across the dashboard / video list / review
 * screens. Kept dependency-free and side-effect-free.
 */

/**
 * Format a date for human reading on dashboard / list rows.
 * Falls back to a placeholder for null/invalid input rather than "Invalid Date".
 */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date+time for the dashboard / scheduling views.
 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Render a byte count as a human-readable string (e.g. 1.4 GB).
 * Returns "—" for null/undefined so callers don't have to guard.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value < 10 && unitIndex > 0 ? value.toFixed(1) : Math.round(value).toString();
  return `${rounded} ${units[unitIndex]}`;
}

/**
 * Render seconds as a chapter-style timestamp (e.g. 1:05, 12:34).
 * Used in chapter editors and the status timeline strip.
 */
export function formatTimestamp(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined) return "—";
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
