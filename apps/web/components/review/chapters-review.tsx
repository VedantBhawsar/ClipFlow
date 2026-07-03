"use client";

import * as React from "react";
import {
  Pencil,
  Plus,
  Trash2,
  Clock,
  GripVertical,
  AlertCircle,
} from "lucide-react";
import type { ChaptersJson } from "@clipflow/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChapterEditDialog } from "@/components/review/chapter-edit-dialog";
import { cn } from "@/lib/utils";

interface ChaptersReviewProps {
  chaptersJson: ChaptersJson;
  durationSeconds: number | null;
  currentTime?: number;
  onSeekChapter?: (seconds: number) => void;
  /**
   * Fired whenever the user mutates the chapter list or summary.
   * Parent owns the canonical state — this is a controlled component.
   */
  onChange?: (next: ChaptersJson) => void;
}

/** Design.md Section 3: chapters must be 10+ seconds apart. */
const MIN_GAP_MS = 10_000;

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

const chapterKey = (ch: { startMs: number; title: string }, index: number) =>
  `${index}-${ch.startMs}-${ch.title}`;

export function ChaptersReview({
  chaptersJson,
  durationSeconds,
  currentTime = 0,
  onSeekChapter,
  onChange,
}: ChaptersReviewProps) {
  const chapters = React.useMemo(
    () => [...chaptersJson.chapters].sort((a, b) => a.startMs - b.startMs),
    [chaptersJson.chapters],
  );
  const summary = chaptersJson.summary;
  const currentTimeMs = currentTime * 1000;

  // Dialog state — which chapter (by sorted index) has the edit dialog open.
  const [dialogIndex, setDialogIndex] = React.useState<number | null>(null);
  const [editingSummary, setEditingSummary] = React.useState(false);
  const [editSummary, setEditSummary] = React.useState(summary);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const activeChapterIndex = React.useMemo(() => {
    let active = 0;
    for (let i = chapters.length - 1; i >= 0; i--) {
      const ch = chapters[i];
      if (ch && currentTimeMs >= ch.startMs) {
        active = i;
        break;
      }
    }
    return active;
  }, [currentTimeMs, chapters]);

  const rowErrors = React.useMemo(() => {
    const out: (string | null)[] = chapters.map(() => null);
    for (let i = 0; i < chapters.length; i++) {
      const cur = chapters[i]!;
      if (i === 0 && cur.startMs !== 0) {
        out[i] = "First chapter must start at 0:00.";
        continue;
      }
      const prev = chapters[i - 1];
      if (prev && cur.startMs - prev.startMs < MIN_GAP_MS) {
        out[i] = "Chapters must be 10+ seconds apart.";
      }
    }
    return out;
  }, [chapters]);

  const emit = React.useCallback(
    (next: { chapters?: ChaptersJson["chapters"]; summary?: string }) => {
      onChange?.({
        summary: next.summary ?? summary,
        chapters: next.chapters ?? chapters,
      });
    },
    [onChange, summary, chapters],
  );

  // ---- summary handlers ----
  const handleStartEditSummary = () => {
    setEditingSummary(true);
    setEditSummary(summary);
  };
  const handleSaveSummary = () => {
    const trimmed = editSummary.trim();
    if (!trimmed) return;
    emit({ summary: trimmed });
    setEditingSummary(false);
  };
  const handleCancelSummaryEdit = () => {
    setEditingSummary(false);
  };

  // ---- chapter handlers ----
  const handleChapterSave = React.useCallback(
    (index: number, patch: { startMs: number; title: string }) => {
      const next = chapters.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      );
      emit({ chapters: next });
      setDialogIndex(null);
    },
    [chapters, emit],
  );

  const handleAddChapter = () => {
    const last = chapters.at(-1);
    const startMs = last ? last.startMs + 10_000 : 0;
    const next = [...chapters, { startMs, title: "New chapter" }];
    emit({ chapters: next });
    // Open the dialog for the new chapter on the next paint.
    requestAnimationFrame(() => {
      const newIndex = [...next]
        .sort((a, b) => a.startMs - b.startMs)
        .findIndex((c) => c.startMs === startMs && c.title === "New chapter");
      if (newIndex >= 0) setDialogIndex(newIndex);
    });
  };

  const handleDeleteChapter = (index: number) => {
    emit({ chapters: chapters.filter((_, i) => i !== index) });
  };

  const handleUseCurrentTime = (index: number) => {
    const target = chapters[index];
    if (!target) return;
    const next = chapters.map((c, i) =>
      i === index ? { ...c, startMs: Math.floor(currentTimeMs) } : c,
    );
    emit({ chapters: next });
  };

  // ---- drag-to-reorder (swaps startMs) ----
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (event: React.DragEvent<HTMLElement>) =>
    event.preventDefault();
  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const src = chapters[dragIndex];
    const dst = chapters[targetIndex];
    if (!src || !dst) { setDragIndex(null); return; }
    const next = chapters.map((c, i) => {
      if (i === dragIndex) return { ...c, startMs: dst.startMs };
      if (i === targetIndex) return { ...c, startMs: src.startMs };
      return c;
    });
    emit({ chapters: next });
    setDragIndex(null);
  };

  const dialogChapter =
    dialogIndex !== null ? chapters[dialogIndex] ?? null : null;

  return (
    <div className="space-y-6">
      {/* Playhead strip */}
      <div className="flex items-baseline gap-3 border-b border-[color:var(--line)] pb-3">
        <span className="text-[11px] uppercase tracking-wide text-[color:var(--ink-muted)]">
          Now playing
        </span>
        <span className="font-mono text-[14px] tabular-nums text-[color:var(--ink)]">
          {formatSeconds(currentTime)}
        </span>
        {durationSeconds ? (
          <>
            <span className="text-[13px] text-[color:var(--ink-muted)]">/</span>
            <span className="font-mono text-[13px] tabular-nums text-[color:var(--ink-muted)]">
              {formatSeconds(durationSeconds)}
            </span>
          </>
        ) : null}
      </div>

      {/* Summary */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
            Description opener
          </h3>
          {!editingSummary ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStartEditSummary}
              className="h-6 gap-1 text-[12px] text-[color:var(--ink-muted)]"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          ) : null}
        </div>
        {editingSummary ? (
          <div className="space-y-2">
            <Textarea
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              className="min-h-[80px] text-[14px]"
              maxLength={280}
              autoFocus
            />
            <p className="font-mono text-[11px] text-[color:var(--ink-muted)]">
              {editSummary.length}/280
            </p>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveSummary}
                disabled={editSummary.trim().length === 0}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelSummaryEdit}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[color:var(--ink)]/85">
            {summary}
          </p>
        )}
      </section>

      {/* Chapters list */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
            Chapters
            <span className="ml-2 font-mono text-[12px] normal-case tracking-normal text-[color:var(--ink-muted)]">
              {chapters.length}
            </span>
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddChapter}
            className="h-7 gap-1 text-[12px]"
            data-testid="chapters-add"
          >
            <Plus className="h-3 w-3" />
            Add chapter
          </Button>
        </div>

        {chapters.length === 0 ? (
          <p className="text-[13px] text-[color:var(--ink-muted)]">
            No chapters yet.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {chapters.map((chapter, index) => {
              const isLast = index === chapters.length - 1;
              const nextChapter = !isLast ? chapters[index + 1] : null;
              const rawDurationMs = nextChapter
                ? nextChapter.startMs - chapter.startMs
                : durationSeconds
                  ? durationSeconds * 1000 - chapter.startMs
                  : null;
              const chapterDurationMs =
                rawDurationMs !== null && rawDurationMs > 0
                  ? rawDurationMs
                  : null;
              const isActive = index === activeChapterIndex;
              const err = rowErrors[index];

              return (
                <li
                  key={chapterKey(chapter, index)}
                  className={cn(
                    "group review-reveal rounded-lg border transition-colors motion-safe:duration-150",
                    err
                      ? "border-[color:var(--status-error)]/60 bg-[color:var(--status-error)]/[0.04]"
                      : isActive
                        ? "border-[color:var(--accent)]/40 bg-[color:var(--surface)]"
                        : "border-[color:var(--line)] bg-[color:var(--surface)] hover:border-[color:var(--ink)]/25",
                  )}
                  style={
                    {
                      ["--stagger-index" as unknown as string]: String(index),
                    } as React.CSSProperties
                  }
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                >
                  <div className="flex items-center gap-2 p-3">
                    {/* Drag handle */}
                    <span
                      className="cursor-grab text-[color:var(--ink-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`Reorder chapter ${index + 1}`}
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>

                    {/* Seek on click */}
                    <button
                      type="button"
                      onClick={() => onSeekChapter?.(chapter.startMs / 1000)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      data-testid="chapter-row"
                    >
                      <div
                        className={cn(
                          "flex h-7 w-16 shrink-0 items-center justify-center rounded-md font-mono text-[12px] tabular-nums",
                          isActive
                            ? "bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                            : "bg-[color:var(--muted)] text-[color:var(--ink-muted)]",
                        )}
                      >
                        {formatMs(chapter.startMs)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[14px]",
                            isActive
                              ? "font-medium text-[color:var(--ink)]"
                              : "text-[color:var(--ink)]",
                          )}
                        >
                          {chapter.title}
                        </span>
                        {chapterDurationMs !== null ? (
                          <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-[color:var(--ink-muted)]">
                            {formatMs(chapterDurationMs)} long
                          </span>
                        ) : null}
                      </div>
                    </button>

                    {/* Row actions */}
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUseCurrentTime(index)}
                        className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Use current playhead as chapter start"
                        title="Use current playhead"
                      >
                        <Clock className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialogIndex(index)}
                        className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Edit chapter"
                      >
                        <Pencil className="h-3 w-3 text-[color:var(--ink-muted)]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteChapter(index)}
                        className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Delete chapter"
                        data-testid="chapter-delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
                      </Button>
                    </div>
                  </div>

                  {err ? (
                    <p
                      className="flex items-center gap-1.5 border-t border-[color:var(--status-error)]/25 bg-[color:var(--status-error)]/[0.06] px-3 py-1.5 text-[12px] text-[color:var(--status-error)]"
                      role="alert"
                    >
                      <AlertCircle
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {err}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Chapter edit dialog — one instance, driven by dialogIndex. */}
      {dialogChapter !== null && dialogIndex !== null ? (
        <ChapterEditDialog
          open={dialogIndex !== null}
          onOpenChange={(open) => {
            if (!open) setDialogIndex(null);
          }}
          index={dialogIndex}
          startMs={dialogChapter.startMs}
          title={dialogChapter.title}
          durationSeconds={durationSeconds}
          onSave={(patch) => handleChapterSave(dialogIndex, patch)}
          existingError={rowErrors[dialogIndex]}
        />
      ) : null}
    </div>
  );
}
