"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThumbnailCard, type ThumbnailOption } from "./thumbnail-card";

interface ThumbnailReviewProps {
  options: ThumbnailOption[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onRegenerate?: () => void;
  regenerationsUsed: number;
  regenerationsAllowed: number;
  disabled?: boolean;
  /** Show loading indicators on placeholder tiles — set while the
   *  worker is generating new thumbnails. */
  regenerating?: boolean;
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
  regenerating = false,
}: ThumbnailReviewProps) {
  const activeId = selectedId ?? options[0]?.id ?? null;
  const regenExhausted = regenerationsUsed >= regenerationsAllowed;
  const regenDisabled = disabled || regenExhausted || !onRegenerate || regenerating;

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
            {regenerating
              ? "Generating fresh options — they'll appear here automatically."
              : "Pick the thumbnail that goes to YouTube. The selected tile has a green border."}
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
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {regenerating ? "Generating…" : "Regenerate options"}
          </Button>
          <span className="font-mono text-[11px] text-[color:var(--ink-muted)]">
            {regenerating
              ? "In progress…"
              : `${regenerationsUsed} of ${regenerationsAllowed} regenerations used${regenExhausted ? " · limit reached" : ""}`}
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
            disabled={disabled || regenerating}
            index={index}
            loading={regenerating && option.src === null}
          />
        ))}
      </div>
    </section>
  );
}
