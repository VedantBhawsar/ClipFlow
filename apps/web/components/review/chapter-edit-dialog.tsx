"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface ChapterEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 0-based index of the chapter being edited, used only for the heading. */
  index: number;
  /** Current millisecond start time. */
  startMs: number;
  /** Current chapter title. */
  title: string;
  /** Total video duration in seconds — used to cap the max timestamp. */
  durationSeconds: number | null;
  /**
   * Called on Save. The parent re-validates the full list and emits via
   * its own `onChange` — this dialog is purely presentational.
   */
  onSave: (patch: { startMs: number; title: string }) => void;
  /**
   * Error string sourced from the parent's `rowErrors` memoisation.
   * Shown inside the dialog when the current row is in an error state.
   */
  existingError?: string | null;
}

/** Convert milliseconds to H:MM:SS or MM:SS for display / input init. */
function msToTimeString(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Parse a time string in MM:SS or H:MM:SS into milliseconds.
 * Returns `null` if the string is malformed.
 */
function timeStringToMs(raw: string): number | null {
  const parts = raw.trim().split(":").map(Number);
  if (parts.some((p) => isNaN(p))) return null;
  if (parts.length === 2) {
    const [m, s] = parts as [number, number];
    if (s < 0 || s >= 60) return null;
    return (m * 60 + s) * 1000;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts as [number, number, number];
    if (m < 0 || m >= 60 || s < 0 || s >= 60) return null;
    return (h * 3600 + m * 60 + s) * 1000;
  }
  return null;
}

const TITLE_MAX = 100;

export function ChapterEditDialog({
  open,
  onOpenChange,
  index,
  startMs,
  title,
  durationSeconds,
  onSave,
  existingError,
}: ChapterEditDialogProps) {
  const [draftTitle, setDraftTitle] = React.useState(title);
  const [draftTime, setDraftTime] = React.useState(msToTimeString(startMs));
  const [timeError, setTimeError] = React.useState<string | null>(null);

  // Sync draft state when the dialog reopens for a different chapter or
  // after the parent refreshes the chapter (e.g. "use current time" was
  // clicked from the row, then the user opens the dialog again).
  React.useEffect(() => {
    if (open) {
      setDraftTitle(title);
      setDraftTime(msToTimeString(startMs));
      setTimeError(null);
    }
  }, [open, title, startMs]);

  const validate = (): { startMs: number; title: string } | null => {
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      return null;
    }

    const parsed = timeStringToMs(draftTime);
    if (parsed === null) {
      setTimeError("Use MM:SS or H:MM:SS format, e.g. 1:23 or 1:02:03.");
      return null;
    }
    if (parsed < 0) {
      setTimeError("Start time can't be negative.");
      return null;
    }
    if (durationSeconds !== null && parsed >= durationSeconds * 1000) {
      setTimeError("Start time must be before the end of the video.");
      return null;
    }
    setTimeError(null);
    return { startMs: parsed, title: trimmedTitle };
  };

  const handleSave = () => {
    const patch = validate();
    if (!patch) return;
    onSave(patch);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="text-[16px] font-medium text-[color:var(--ink)]">
            Edit chapter {index + 1}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[color:var(--ink-muted)]">
            Update the title and start time for this chapter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label
              htmlFor="chapter-title"
              className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]"
            >
              Title
            </Label>
            <Input
              id="chapter-title"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Chapter title"
              className="text-[14px]"
              autoFocus
            />
            <p className="text-right font-mono text-[11px] text-[color:var(--ink-muted)]">
              {draftTitle.length}/{TITLE_MAX}
            </p>
          </div>

          {/* Start time */}
          <div className="space-y-1.5">
            <Label
              htmlFor="chapter-time"
              className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]"
            >
              Start time
            </Label>
            <Input
              id="chapter-time"
              value={draftTime}
              onChange={(e) => {
                setDraftTime(e.target.value);
                setTimeError(null);
              }}
              placeholder="0:00"
              className={cn(
                "font-mono text-[14px] tabular-nums",
                timeError && "border-[color:var(--status-error)] focus-visible:ring-[color:var(--status-error)]",
              )}
            />
            {timeError ? (
              <p className="flex items-center gap-1.5 text-[12px] text-[color:var(--status-error)]">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {timeError}
              </p>
            ) : (
              <p className="text-[11px] text-[color:var(--ink-muted)]">
                MM:SS or H:MM:SS — e.g.{" "}
                <span className="font-mono">1:23</span> or{" "}
                <span className="font-mono">1:02:03</span>
              </p>
            )}
          </div>

          {/* Forwarded row-level validation error (gap / first-chapter rule) */}
          {existingError ? (
            <p className="flex items-start gap-1.5 rounded-md border border-[color:var(--status-error)]/30 bg-[color:var(--status-error)]/[0.06] px-3 py-2.5 text-[12px] text-[color:var(--status-error)]">
              <AlertCircle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              {existingError}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={draftTitle.trim().length === 0}
          >
            Save chapter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
