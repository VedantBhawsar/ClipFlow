"use client";

import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { CreateVideoDialog } from "@/components/dashboard/create-video-dialog";
import { VideoCard } from "@/components/dashboard/video-card";
import { useDeleteVideo, useVideos } from "@/hooks/use-videos";

interface VideoListProps {
  /**
   * Whether the user has connected a YouTube channel. The create-video
   * CTA is gated on this — uploading without a connection would fail
   * server-side with YOUTUBE_NOT_CONNECTED.
   */
  channelConnected: boolean;
}

/**
 * Dashboard videos section. Replaces the old `<EmptyState>` —
 * fetches via TanStack Query, handles its own empty state, and the
 * create-video dialog wraps its own trigger via `<DialogTrigger>`.
 */
export function VideoList({ channelConnected }: VideoListProps) {
  const videosQuery = useVideos();
  const deleteMutation = useDeleteVideo();

  const videos = videosQuery.data?.videos ?? [];
  const isLoading = videosQuery.isLoading;


  console.log("vidoes", videos)

  const handleCancel = (id: string) => {
    if (!confirm("Cancel this video? The file will be removed.")) return;
    deleteMutation.mutate(id);
  };

  const disabledReason = channelConnected
    ? undefined
    : "Connect your YouTube channel first";

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 bg-card" />
        <Skeleton className="h-24 bg-card" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <section
        aria-labelledby="videos-empty-title"
        className="rounded-xl border border-dashed border-border bg-card/40 p-8 sm:p-12"
      >
        <div className="flex flex-col items-start gap-3">
          <h2
            id="videos-empty-title"
            className="text-lg font-semibold tracking-tight"
          >
            No videos yet
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Upload a finished video. ClipFlow stores it, then publishes
            to your YouTube channel — immediately or on a schedule.
          </p>
          <CreateVideoDialog
            variant="empty-state"
            disabled={!channelConnected}
            channelConnected={channelConnected}
            {...(disabledReason ? { disabledReason } : {})}
          />
          <p className="text-xs text-muted-foreground">
            {channelConnected
              ? "Up to 5 GB per video. MP4, MOV, or WebM."
              : "Connect your YouTube channel above to get started."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
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
          />
        ))}
      </div>
    </>
  );
}
