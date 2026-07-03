"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThumbnailCard, type ThumbnailOption } from "./thumbnail-card";

interface ThumbnailReviewProps {
  options: ThumbnailOption[];
  /** id of the currently active option — falls back to `options[0]`. */
  selectedId?: string | null;
  /** Called when the user clicks a candidate tile. Callers can no-op
   *  this while the underlying data model can only store a single
   *  thumbnail — the visual state still updates locally. */
  onSelect?: (id: string) => void;
  /** Called when the user clicks the Regenerate action. */
  onRegenerate?: () => void;
  /** Copy for the regen counter — Design.md Section 3 wants the tier
   *  limit visible near the action so it never surprises the creator. */
  regenerationsUsed: number;
  regenerationsAllowed: number;
  /** Disable both selection and the regenerate action (published,
   *  processing, etc.). */
  disabled?: boolean;
}

/**
 * Thumbnails grid — the second half of the Review screen.
 *
 * Renders the candidate tiles at 16:9 with a 2px accent border on the
 * selected one, plus a small "X of Y regenerations used" caption next
 * to the regenerate button (Design.md Section 3).
 */
export function ThumbnailReview({
  options,
  selectedId,
  onSelect,
  onRegenerate,
  regenerationsUsed,
  regenerationsAllowed,
  disabled = false,
}: ThumbnailReviewProps) {
  const activeId = selectedId ?? options[0]?.id ?? null;
  const regenExhausted = regenerationsUsed >= regenerationsAllowed;
  const regenDisabled = disabled || regenExhausted || !onRegenerate;

  return (
    <section
      aria-labelledby="thumbnails-heading"
      className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-5"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2
            id="thumbnails-heading"
            className="text-[16px] font-medium text-[color:var(--ink)]"
          >
            Thumbnails
          </h2>
          <p className="text-[13px] text-[color:var(--ink-muted)]">
            Pick the thumbnail that goes to YouTube. The selected tile
            has a green border.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={regenDisabled}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Regenerate options
          </Button>
          <span className="font-mono text-[11px] text-[color:var(--ink-muted)]">
            {regenerationsUsed} of {regenerationsAllowed} regenerations used
            {regenExhausted ? " · limit reached" : ""}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {options.map((option, index) => (
          <ThumbnailCard
            key={option.id}
            option={option}
            selected={option.id === activeId}
            onSelect={onSelect}
            disabled={disabled}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}
