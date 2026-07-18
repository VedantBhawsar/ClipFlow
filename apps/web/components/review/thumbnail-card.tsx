"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shape for a single thumbnail candidate rendered by
 * `<ThumbnailCard>`. The `id` is used for the React key and for
 * `onSelect` — thumbnails don't carry a persistent identity yet, so
 * callers usually pass the S3 key or a stable slot label.
 */
export interface ThumbnailOption {
  id: string;
  /** Image URL. `null` = empty slot (rendered as a placeholder tile). */
  src: string | null;
  /** Alt text — never leave blank on the selected tile. */
  alt: string;
  /** Short user-facing description ("Your upload", "AI candidate 1"). */
  label: string;
}

interface ThumbnailCardProps {
  option: ThumbnailOption;
  selected: boolean;
  onSelect?: (id: string) => void;
  index?: number;
  disabled?: boolean;
  className?: string;
  /** Show a skeleton loading pulse — used when regeneration is in
   *  flight and the slot is still a placeholder. */
  loading?: boolean;
}

/**
 * Single 16:9 thumbnail tile — the base unit of the Review screen's
 * thumbnail grid.
 *
 * Selected state uses a 2px accent border (Design.md Section 3 —
 * "the one deliberate thick-border exception"). Unselected tiles use
 * the standard hairline `--line` border so the difference is legible
 * without color alone; the selected tile also carries a small text
 * chip ("Selected") for AA compliance with Design.md Section 6.
 */
export function ThumbnailCard({
  option,
  selected,
  onSelect,
  index = 0,
  disabled = false,
  className,
  loading = false,
}: ThumbnailCardProps) {
  const isPlaceholder = option.src == null;
  const interactive = !disabled && onSelect && !isPlaceholder && !loading;

  const inner = (
    <>
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-md",
          loading
            ? "motion-safe:animate-pulse bg-[color:var(--muted)]"
            : "bg-[color:var(--muted)]",
        )}
      >
        {loading ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] text-[color:var(--ink-muted)]">
            <span className="font-mono uppercase tracking-wide">Generating</span>
            <span>Please wait…</span>
          </div>
        ) : option.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={option.src}
            alt={option.alt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] text-[color:var(--ink-muted)]">
            <span className="font-mono uppercase tracking-wide">Empty</span>
            <span>Regenerate to fill</span>
          </div>
        )}
        {selected ? (
          <span
            className={cn(
              "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              "bg-[color:var(--accent)] text-[color:var(--accent-foreground)]",
            )}
            aria-hidden="true"
          >
            Selected
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline justify-between gap-2 pt-2">
        <span
          className={cn(
            "truncate text-[13px]",
            selected
              ? "font-medium text-[color:var(--ink)]"
              : "text-[color:var(--ink-muted)]",
          )}
        >
          {option.label}
        </span>
        {selected ? (
          <span className="font-mono text-[11px] uppercase tracking-wide text-[color:var(--accent)]">
            Active
          </span>
        ) : null}
      </div>
    </>
  );

  const shellClass = cn(
    "flex flex-col rounded-lg p-1.5 transition-colors motion-safe:duration-150 review-reveal",
    selected
      ? "border-2 border-[color:var(--accent)]"
      : "border border-[color:var(--line)]",
    interactive && "hover:border-[color:var(--ink)]/40",
    disabled && !selected && "opacity-70",
    className,
  );

  const style: React.CSSProperties = {
    // Consumed by the .review-reveal keyframes.
    ["--stagger-index" as unknown as string]: String(index),
  };

  if (interactive) {
    return (
      <button
        type="button"
        onClick={() => onSelect(option.id)}
        aria-pressed={selected}
        aria-label={`Select thumbnail: ${option.label}`}
        className={cn(shellClass, "text-left")}
        style={style}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={shellClass}
      style={style}
      role="group"
      aria-label={option.label}
    >
      {inner}
    </div>
  );
}
