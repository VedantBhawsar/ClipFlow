"use client";

import * as React from "react";
import ArtPlayer from "artplayer";
import { Sparkles, Save, X } from "lucide-react";
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
 * The panel is now the canonical owner of the in-flight edit state:
 *  - `serverValue` is the value returned from the API (the source of
 *    truth until the user saves).
 *  - `draftValue` is the user's pending edits.
 *  - `isDirty` is `serverValue !== draftValue` (deep via JSON.stringify
 *    for cheapness — the shape is bounded so this is fine).
 *
 * `ChaptersReview` is a controlled component — every local mutation
 * flows back through `onChange` and lands in `draftValue`. The user
 * hits "Save changes" to persist via `useUpdateVideo`, or "Discard" to
 * roll `draftValue` back to `serverValue`.
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
      className="rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <h2
            id="review-heading"
            className="text-sm font-semibold text-foreground"
          >
            Review Generated Content
          </h2>
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
      <p className="border-b border-border px-4 pb-3 pt-0 text-xs text-muted-foreground">
        Preview the video and review the AI-generated chapters and summary
        before publishing.
      </p>

      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <VideoPlayer
            videoId={videoId}
            chaptersJson={chaptersJson}
            onReady={handleReady}
            onTimeUpdate={handleTimeUpdate}
          />
        </div>
        <div className="max-h-[500px] overflow-y-auto lg:col-span-1">
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