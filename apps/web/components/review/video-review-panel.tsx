"use client";

import * as React from "react";
import ArtPlayer from "artplayer";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import type { ChaptersJson } from "@clipflow/types";
import { VideoPlayer } from "@/components/review/video-player";
import { ChaptersReview } from "@/components/review/chapters-review";
import { Button } from "@/components/ui/button";
import { useUpdateVideo } from "@/hooks/use-videos";

interface VideoReviewPanelProps {
  videoId: string;
  chaptersJson: ChaptersJson;
  durationSeconds: number | null;
}

/**
 * Review screen for the AI-generated chapter list + summary. Owned by
 * the video detail page when the row is in `READY_FOR_REVIEW`.
 *
 * Layout note: this section takes the two-column wide layout exception
 * called out in Design.md — the player + summary/chapters strip is the
 * "payoff moment" and gets more width than the Details section below.
 *
 * State model:
 *  - `serverValue` is the value returned from the API (the source of
 *    truth until the user saves).
 *  - `draftValue` is the user's pending edits.
 *  - `isDirty` is `serverValue !== draftValue` (deep via JSON.stringify
 *    for cheapness — the shape is bounded so this is fine).
 *
 * `ChaptersReview` is a controlled component — every local mutation
 * flows back through `onChange` and lands in `draftValue`.
 */
export function VideoReviewPanel({
  videoId,
  chaptersJson,
  durationSeconds,
}: VideoReviewPanelProps) {
  const artRef = React.useRef<ArtPlayer | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [serverValue, setServerValue] = React.useState(chaptersJson);
  const [draftValue, setDraftValue] = React.useState(chaptersJson);

  // Sync local state if the server value changes (e.g. SSE push from
  // the worker landed mid-session, or another tab saved first). We
  // only accept the server value when the user hasn't started editing
  // — once they're dirty, we keep their draft and let the next Save
  // resolve the conflict (last-write-wins for now).
  const dirty = React.useRef(false);
  React.useEffect(() => {
    if (!dirty.current) {
      setServerValue(chaptersJson);
      setDraftValue(chaptersJson);
    }
  }, [chaptersJson]);

  const isDirty =
    JSON.stringify(serverValue) !== JSON.stringify(draftValue);

  const updateVideo = useUpdateVideo();

  const handleChange = React.useCallback((next: ChaptersJson) => {
    dirty.current = true;
    setDraftValue(next);
  }, []);

  const handleSave = async () => {
    try {
      const updated = await updateVideo.mutateAsync({
        id: videoId,
        body: {
          summary: draftValue.summary,
          chapters: draftValue.chapters,
        },
      });
      // The server returns the canonical row; rebuild `chaptersJson`
      // from it so the panel reflects what actually persisted.
      if (updated.chaptersJson) {
        setServerValue(updated.chaptersJson);
        setDraftValue(updated.chaptersJson);
        dirty.current = false;
      }
      toast.success("Review saved.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save your edits.",
      );
    }
  };

  const handleDiscard = () => {
    setDraftValue(serverValue);
    dirty.current = false;
  };

  const handleReady = React.useCallback((art: ArtPlayer) => {
    artRef.current = art;
  }, []);

  const handleTimeUpdate = React.useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeekChapter = React.useCallback((seconds: number) => {
    const art = artRef.current;
    if (art) {
      art.currentTime = seconds;
      art.play().catch(() => {});
    }
  }, []);

  const saving = updateVideo.isPending;

  return (
    <section
      aria-labelledby="review-heading"
      className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <div className="min-w-0 space-y-1">
          <h2
            id="review-heading"
            className="text-[16px] font-medium text-[color:var(--ink)]"
          >
            Review chapters &amp; summary
          </h2>
          <p className="text-[13px] text-[color:var(--ink-muted)]">
            Preview the video and edit the generated chapters before scheduling.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5" />
              Discard
            </Button>
          ) : null}
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving}
            data-testid="review-save"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <VideoPlayer
            videoId={videoId}
            chaptersJson={chaptersJson}
            onReady={handleReady}
            onTimeUpdate={handleTimeUpdate}
          />
        </div>
        <div className="max-h-[560px] overflow-y-auto pr-1">
          <ChaptersReview
            chaptersJson={draftValue}
            durationSeconds={durationSeconds}
            currentTime={currentTime}
            onSeekChapter={handleSeekChapter}
            onChange={handleChange}
          />
        </div>
      </div>
    </section>
  );
}
