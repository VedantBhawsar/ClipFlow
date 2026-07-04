"use client";

import Link from "next/link";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface DashboardStatsProps {
  /** Rows the worker is still actively processing or hasn't yet been
   *  queued for (UPLOADED, READY, EXTRACTING, TRANSCRIBING, GENERATING,
   *  SCHEDULED, PUBLISHING). Excludes failed. */
  inFlight: number;
  /** Rows that finished processing and are awaiting the user's "Publish"
   *  decision (READY_FOR_REVIEW). Excludes scheduled and failed. */
  readyToPublish: number;
  /** Rows in a hard-stop error state (FAILED, PUBLISH_FAILED). */
  failed: number;
  /** ID of the first ready-to-publish video — used to make the "Ready
   *  to publish" card a deep link straight into that row's detail page
   *  instead of forcing a list scan. `undefined` while loading. */
  firstReadyId?: string;
  /** Show neutral dashes instead of values until the initial fetch
   *  resolves. Keeps layout stable so the parent doesn't reflow when
   *  the numbers arrive. */
  loading?: boolean;
}

/**
 * Three small stat cards summarizing the in-progress pipeline. Lets a
 * creator answer "what's happening?" without scanning the list below.
 *
 * Each card is a rounded-xl surface with a colored left-ribbon whose
 * tone mirrors the underlying status the count refers to — the
 * processing pulse is `--status-processing`, the readied one is
 * `--status-ready`, the failed one is `--status-error`. The numeric
 * value is the design's "tabular-nums mono" pattern so the digits
 * don't shift as the count changes.
 *
 * Visual states for each card:
 *  - "loading" → em-dash, no ribbon.
 *  - "all caught up" → muted sub-label ("Nothing pending", "All
 *    systems clear"), ribbon dims down to `--line`.
 *  - "active" → sub-label references the count, ribbon is the tone
 *    color.
 *
 * "Ready to publish" is the only interactive card: when `readyToPublish
 * > 0` it deep-links straight into the first ready row's detail page,
 * which is the single most useful shortcut on the dashboard (skip past
 * scanning the list to find that one green "Ready" pill).
 */
export function DashboardStats({
  inFlight,
  readyToPublish,
  failed,
  firstReadyId,
  loading,
}: DashboardStatsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="In flight"
        value={inFlight}
        loading={loading}
        icon={Loader2}
        tone="processing"
        sublabel={
          loading
            ? "Checking the pipeline"
            : inFlight === 0
              ? "Nothing pending"
              : `${inFlight} processing right now`
        }
      />
      <StatCard
        label="Ready to publish"
        value={readyToPublish}
        loading={loading}
        icon={Upload}
        tone="ready"
        sublabel={
          loading
            ? "Checking the pipeline"
            : readyToPublish === 0
              ? "All caught up"
              : `${readyToPublish} awaiting your review`
        }
        href={firstReadyId ? `/dashboard/published/${firstReadyId}` : undefined}
      />
      <StatCard
        label="Failed"
        value={failed}
        loading={loading}
        icon={AlertCircle}
        tone="error"
        sublabel={
          loading
            ? "Checking the pipeline"
            : failed === 0
              ? "All systems clear"
              : `${failed} need attention`
        }
      />
    </div>
  );
}

type Tone = "processing" | "ready" | "error";

interface StatCardProps {
  label: string;
  value: number;
  loading?: boolean;
  icon: LucideIcon;
  tone: Tone;
  /** Sub-label below the value. Always rendered so the layout stays
   *  stable as counts move between states. */
  sublabel: string;
  /** When provided, the entire card becomes a deep-link. Used by the
   *  "Ready to publish" card to skip straight to that row's detail. */
  href?: string;
}

/**
 * Single stat tile. The colored left-edge ribbon is a 4px-wide strip
 * that signals the underlying tone without adding a border — border on
 * three sides only, so the card reads as a flat surface with an accent.
 *
 * Wrapped in `<Link>` when `href` is set so the entire card is the
 * click target (Design.md §9 navigation pattern: predictable, ample
 * tap target).
 */
function StatCard({
  label,
  value,
  loading,
  icon: Icon,
  tone,
  sublabel,
  href,
}: StatCardProps) {
  const valueClass =
    tone === "processing"
      ? "text-[color:var(--status-processing)]"
      : tone === "ready"
        ? "text-[color:var(--status-ready)]"
        : "text-[color:var(--status-error)]";

  // Active = the count is non-zero. Otherwise the ribbon dims to the
  // neutral `--line` token so the card reads as "calm, no drama".
  // `loading` is always dim since we don't have data yet.
  const active = !loading && value > 0;
  const ribbonClass = loading
    ? "bg-[color:var(--line)]"
    : active
      ? tone === "processing"
        ? "bg-[color:var(--status-processing)]"
        : tone === "ready"
          ? "bg-[color:var(--status-ready)]"
          : "bg-[color:var(--status-error)]"
      : "bg-[color:var(--line)]";

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-2 left-0 w-1 rounded-r-sm transition-colors",
          ribbonClass,
        )}
      />
      <div className="space-y-1.5">
        <p className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
          {label}
        </p>
        <p
          className={cn(
            "font-mono text-[28px] leading-none tabular-nums",
            loading ? "text-[color:var(--ink-muted)]" : valueClass,
          )}
        >
          {loading ? "—" : value}
        </p>
        <p className="text-xs text-[color:var(--ink-muted)]">{sublabel}</p>
      </div>
      <Icon
        aria-hidden="true"
        className={cn(
          "absolute right-3 top-3 h-3.5 w-3.5",
          active ? valueClass : "text-[color:var(--ink-muted)]",
          tone === "processing" && active && "motion-safe:animate-spin",
        )}
      />
    </>
  );

  const cardClass = cn(
    "relative overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 pl-5",
    "transition-colors",
    href && "hover:border-[color:var(--ink)]/20 focus-within:border-[color:var(--ink)]/30",
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          cardClass,
          "group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}
