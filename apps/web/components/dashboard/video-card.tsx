"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";
import type { Video, SseVideoEvent } from "@clipflow/types";

import { StatusTimeline } from "@/components/dashboard/status-timeline";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/dashboard/status-pill";
import { cn } from "@/lib/utils";
import { isFailedStatus, mapTimelineStatus } from "@/lib/video-status";

interface VideoCardProps {
  video: Video;
  onCancel?: (id: string) => void;
  isCancelling?: boolean;
  /** Latest SSE events for real-time progress display */
  sseEvents?: SseVideoEvent[];
}

/**
 * One row in the dashboard video list. Renders the title, status pill,
 * status timeline (with stage labels visible — per Design.md this is
 * the signature element, never a generic "Processing" spinner), and a
 * "View on YouTube" link once published.
 *
 * When `sseEvents` is provided the card picks the latest SSE event for
 * its video ID and renders a live progress bar (PROGRESS) or status
 * indicator (STATUS_UPDATE / ERROR) above the timeline.
 */
export function VideoCard({ video, onCancel, isCancelling, sseEvents }: VideoCardProps) {
  const timelineStatus = mapTimelineStatus(video.status);
  const hasError = isFailedStatus(video.status);
  const thumbnailUrl = video.youtubeVideoId
    ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
    : null;
  const canCancel = [
    "UPLOADED", "READY", "EXTRACTING", "TRANSCRIBING",
    "GENERATING", "SCHEDULED", "PUBLISH_FAILED", "FAILED",
  ].includes(video.status);

  // Find the latest SSE event for this specific video
  const latestSseEvent = sseEvents?.reduceRight<SseVideoEvent | undefined>(
    (found, e) => found ?? (e.videoId === video.id ? e : undefined),
    undefined,
  );

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4 sm:flex-row sm:items-center",
        hasError && "border-[color:var(--status-error)]/30",
      )}
    >
      <div className="flex items-center gap-4">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="h-16 w-28 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-md bg-[color:var(--muted)] text-xs text-[color:var(--ink-muted)]">
            {video.status === "PUBLISHING" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : hasError ? (
              <AlertCircle className="h-5 w-5 text-[color:var(--status-error)]" />
            ) : (
              "—"
            )}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-baseline gap-2">
            {/* Title is the link target — drilling into a video opens
                its detail page. Wrapping just the title (not the whole
                card) so the right-side action buttons stay clickable
                and so the row itself doesn't get an ambiguous "link"
                treatment under focus. */}
            <h3 className="truncate text-sm font-medium text-[color:var(--ink)]">
              <Link
                href={`/dashboard/published/${video.id}`}
                className="rounded-sm outline-none transition-colors hover:text-[color:var(--ink)]/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {video.title}
              </Link>
            </h3>
            <StatusPill status={video.status} />
          </div>

          {latestSseEvent?.type === "PROGRESS" ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[color:var(--accent)]">{latestSseEvent.stage}</span>
                <span className="font-mono tabular-nums text-[color:var(--ink-muted)]">
                  {latestSseEvent.progress}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--muted)]">
                <div
                  className="h-full rounded-full bg-[color:var(--accent)] transition-all duration-500 ease-out"
                  style={{ width: `${latestSseEvent.progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {latestSseEvent?.type === "ERROR" ? (
            <p className="truncate text-xs text-[color:var(--status-error)]">
              Error: {latestSseEvent.error}
            </p>
          ) : null}

          <StatusTimeline status={timelineStatus} hasError={hasError} />
          {video.failureReason ? (
            <p className="truncate text-xs text-[color:var(--status-error)]">
              {video.failureReason}
            </p>
          ) : null}
          {video.scheduledPublishAt && video.status === "SCHEDULED" ? (
            <p className="text-xs text-[color:var(--ink-muted)]">
              Will publish{" "}
              <span className="font-mono tabular-nums text-[color:var(--ink)]">
                {new Date(video.scheduledPublishAt).toLocaleString()}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 ml-auto">
        {video.youtubeVideoId ? (
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://youtu.be/${video.youtubeVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              View on YouTube
            </a>
          </Button>
        ) : null}
        {canCancel && onCancel ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCancel(video.id)}
            disabled={isCancelling}
            className="text-[color:var(--ink-muted)] hover:text-[color:var(--status-error)]"
          >
            {isCancelling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Cancel"
            )}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
