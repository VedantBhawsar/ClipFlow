"use client";

import * as React from "react";
import { Pencil, Check, X, Plus, Trash2, Clock } from "lucide-react";
import type { ChaptersJson } from "@clipflow/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChaptersReviewProps {
  chaptersJson: ChaptersJson;
  durationSeconds: number | null;
  currentTime?: number;
  onSeekChapter?: (seconds: number) => void;
  /**
   * Fired whenever the user mutates the chapter list or summary.
   * Parent owns the canonical state — this is a controlled component.
   * The parent decides whether to persist (e.g. only on Save click).
   */
  onChange?: (next: ChaptersJson) => void;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Stable id for a chapter row, derived from its position + startMs.
 * Used as the React key + the per-row edit/delete handle. We don't
 * store a real id on the chapter shape itself because the wire format
 * is just `{ startMs, title }[]` and the LLM doesn't mint ids.
 */
const chapterKey = (ch: { startMs: number; title: string }, index: number) =>
  `${index}-${ch.startMs}-${ch.title}`;

export function ChaptersReview({
  chaptersJson,
  durationSeconds,
  currentTime = 0,
  onSeekChapter,
  onChange,
}: ChaptersReviewProps) {
  // The chapters list is rendered sorted by startMs so the UI order
  // matches the timestamps — the server stores whatever the user sends,
  // so we re-sort on every render to keep the view honest.
  const chapters = React.useMemo(
    () =>
      [...chaptersJson.chapters].sort((a, b) => a.startMs - b.startMs),
    [chaptersJson.chapters],
  );
  const summary = chaptersJson.summary;
  const currentTimeMs = currentTime * 1000;

  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editingSummary, setEditingSummary] = React.useState(false);
  const [editSummary, setEditSummary] = React.useState(summary);

  // Track the editing index against the unsorted list so that when we
  // commit a title edit, we can address the right chapter regardless of
  // where the sort places it on the next render.
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (editingIndex === null) {
      setEditingKey(null);
      return;
    }
    const target = chapters[editingIndex];
    if (target) setEditingKey(chapterKey(target, editingIndex));
  }, [editingIndex, chapters]);

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

  const emit = React.useCallback(
    (next: { chapters?: ChaptersJson["chapters"]; summary?: string }) => {
      onChange?.({
        summary: next.summary ?? summary,
        chapters: next.chapters ?? chapters,
      });
    },
    [onChange, summary, chapters],
  );

  const handleStartEdit = (index: number) => {
    const chapter = chapters[index];
    if (!chapter) return;
    setEditingIndex(index);
    setEditTitle(chapter.title);
  };

  const handleSaveEdit = (index: number) => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    const target = chapters[index];
    if (!target) return;
    const next = chapters.map((c, i) =>
      i === index ? { ...c, title: trimmed } : c,
    );
    emit({ chapters: next });
    setEditingIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleStartEditSummary = () => {
    setEditingSummary(true);
    setEditSummary(summary);
  };

  const handleSaveSummary = () => {
    const trimmed = editSummary.trim();
    if (trimmed.length === 0) return;
    emit({ summary: trimmed });
    setEditingSummary(false);
  };

  const handleCancelSummaryEdit = () => {
    setEditingSummary(false);
  };

  const handleAddChapter = () => {
    // Place the new chapter 10 seconds after the last one (or at 0 if
    // the list is empty). The title defaults to "New chapter" so the
    // user has something to overwrite.
    const last = chapters.at(-1);
    const startMs = last ? last.startMs + 10_000 : 0;
    const next = [...chapters, { startMs, title: "New chapter" }];
    emit({ chapters: next });
    // Focus the new row's edit field on the next paint.
    requestAnimationFrame(() => {
      const newIndex = [...next].sort((a, b) => a.startMs - b.startMs).findIndex(
        (c) => c.startMs === startMs,
      );
      if (newIndex >= 0) handleStartEdit(newIndex);
    });
  };

  const handleDeleteChapter = (index: number) => {
    const next = chapters.filter((_, i) => i !== index);
    emit({ chapters: next });
  };

  const handleUseCurrentTime = (index: number) => {
    const target = chapters[index];
    if (!target) return;
    const next = chapters.map((c, i) =>
      i === index ? { ...c, startMs: Math.floor(currentTimeMs) } : c,
    );
    emit({ chapters: next });
  };

  const handleChapterClick = (startMs: number) => {
    onSeekChapter?.(startMs / 1000);
  };

  return (
    <div className="space-y-6">
      {/* Video position indicator */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Current position
        </span>
        <span className="font-mono text-sm tabular-nums text-foreground">
          {formatSeconds(currentTime)}
        </span>
        {durationSeconds ? (
          <>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {formatSeconds(durationSeconds)}
            </span>
          </>
        ) : null}
      </div>

      {/* Summary */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Summary</h3>
          {!editingSummary ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStartEditSummary}
              className="h-6 gap-1 text-xs text-muted-foreground"
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
              className="min-h-[80px] text-sm"
              maxLength={280}
            />
            <p className="text-[11px] text-muted-foreground">
              {editSummary.length}/280
            </p>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveSummary}
                disabled={editSummary.trim().length === 0}
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelSummaryEdit}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-foreground/80">
            {summary}
          </p>
        )}
      </section>

      {/* Chapters */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Chapters
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {chapters.length}
            </Badge>
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddChapter}
            className="h-7 gap-1 text-xs"
            data-testid="chapters-add"
          >
            <Plus className="h-3 w-3" />
            Add chapter
          </Button>
        </div>

        {chapters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chapters yet.</p>
        ) : (
          <div className="space-y-1.5">
            {chapters.map((chapter, index) => {
              const isLast = index === chapters.length - 1;
              const nextChapter = !isLast ? chapters[index + 1] : null;
              const rawDurationMs = nextChapter
                ? nextChapter.startMs - chapter.startMs
                : durationSeconds
                  ? durationSeconds * 1000 - chapter.startMs
                  : null;
              const chapterDurationMs =
                rawDurationMs !== null && rawDurationMs > 0 ? rawDurationMs : null;
              const isEditing =
                editingKey === chapterKey(chapter, index);
              const isActive = index === activeChapterIndex;

              return (
                <div
                  key={chapterKey(chapter, index)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg border p-3 transition-colors",
                    isEditing
                      ? "border-primary/50 bg-primary/5"
                      : isActive
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border hover:border-border/80 hover:bg-muted/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleChapterClick(chapter.startMs)}
                    disabled={isEditing}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    data-testid="chapter-row"
                  >
                    <div
                      className={cn(
                        "flex h-7 w-14 shrink-0 items-center justify-center rounded-md font-mono text-[11px]",
                        isActive
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {formatMs(chapter.startMs)}
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveEdit(index);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              handleCancelEdit();
                            }
                          }}
                          className="h-7 text-sm"
                          autoFocus
                          maxLength={100}
                        />
                      ) : (
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isActive
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-foreground",
                          )}
                        >
                          {chapter.title}
                        </span>
                      )}

                      {chapterDurationMs !== null && !isEditing ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {formatMs(chapterDurationMs)} duration
                        </span>
                      ) : null}
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {isEditing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveEdit(index)}
                          className="h-7 w-7 p-0"
                          disabled={editTitle.trim().length === 0}
                          aria-label="Save chapter title"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="h-7 w-7 p-0"
                          aria-label="Cancel editing"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUseCurrentTime(index)}
                          className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
                          aria-label="Use current playhead as chapter start"
                          title="Use current playhead"
                        >
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(index)}
                          className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
                          aria-label="Edit chapter title"
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteChapter(index)}
                          className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
                          aria-label="Delete chapter"
                          data-testid="chapter-delete"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}