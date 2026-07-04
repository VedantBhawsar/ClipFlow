"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CreateVideoDialog } from "@/components/dashboard/create-video-dialog";
import { VideoCard } from "@/components/dashboard/video-card";
import { useDeleteVideo } from "@/hooks/use-videos";
import type { Video, SseVideoEvent } from "@clipflow/types";

interface VideoListProps {
  /**
   * The already-fetched videos to render. In the SSR dashboard flow
   * this comes from the server component's `fetchVideos` call; in the
   * published page from `fetchPublishedVideos`. The component does
   * not call `useVideos()` itself — the server is the source of truth.
   */
  videos: Video[];
  /**
   * Whether the user has connected a YouTube channel. The create-video
   * CTA is gated on this — uploading without a connection would fail
   * server-side with YOUTUBE_NOT_CONNECTED.
   */
  channelConnected: boolean;
  /**
   * Optional empty-state hint shown under the create-video CTA on the
   * `empty-state` variant. Mirrors what the original `<EmptyState>`
   * showed (file size / format guidance).
   */
  emptyHint?: string;
  /** Latest SSE events for real-time progress display in VideoCards */
  sseEvents?: SseVideoEvent[];
}

/**
 * Dashboard / published-page videos section.
 *
 * Presentational + actions. The server component hands us the videos
 * (so the very first paint is meaningful); we own the per-row delete
 * mutation and the post-mutation `router.refresh()` so the server
 * re-renders with fresh data.
 *
 * The `useDeleteVideo` mutation still hits TanStack Query's cache so
 * concurrent consumers (e.g. a future "videos" badge on the sidebar)
 * stay consistent; the `router.refresh()` afterwards is what makes
 * THIS page re-render with the new server truth.
 */
export function VideoList({
  videos,
  channelConnected,
  emptyHint,
  sseEvents,
}: VideoListProps) {
  const router = useRouter();
  const deleteMutation = useDeleteVideo();

  const disabledReason = channelConnected
    ? undefined
    : "Connect your YouTube channel first";

  const handleCancel = (id: string) => {
    if (!confirm("Cancel this video? The file will be removed.")) return;
    deleteMutation.mutate(id, {
      onSuccess: () => router.refresh(),
    });
  };

  if (videos.length === 0) {
    return (
      <section
        aria-labelledby="videos-empty-title"
        className="rounded-xl border border-dashed border-[color:var(--line)] bg-[color:var(--surface)] p-8 sm:p-12"
      >
        <div className="flex flex-col items-start gap-3">
          <h2
            id="videos-empty-title"
            className="text-xl font-semibold tracking-tight text-[color:var(--ink)]"
          >
            No videos yet
          </h2>
          <p className="max-w-prose text-sm text-[color:var(--ink-muted)]">
            Upload a finished video. ClipFlow stores it, then publishes
            to your YouTube channel — immediately or on a schedule.
          </p>
          <CreateVideoDialog
            variant="empty-state"
            disabled={!channelConnected}
            channelConnected={channelConnected}
            {...(disabledReason ? { disabledReason } : {})}
          />
          {emptyHint ? (
            <p className="text-xs text-[color:var(--ink-muted)]">{emptyHint}</p>
          ) : (
            <p className="text-xs text-[color:var(--ink-muted)]">
              {channelConnected
                ? "Up to 5 GB per video. MP4, MOV, or WebM."
                : "Connect your YouTube channel above to get started."}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-[color:var(--ink-muted)]">
          {videos.length} video{videos.length === 1 ? "" : "s"}
        </p>
        <CreateVideoDialog
          variant="compact"
          disabled={!channelConnected}
          channelConnected={channelConnected}
          {...(disabledReason ? { disabledReason } : {})}
        />
      </div>

      <div className="space-y-3">
        {videos.map((v) => (
          <VideoCard
            key={v.id}
            video={v}
            onCancel={handleCancel}
            isCancelling={deleteMutation.isPending && deleteMutation.variables === v.id}
            sseEvents={sseEvents}
          />
        ))}
      </div>
    </>
  );
}
