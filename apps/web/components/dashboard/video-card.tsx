"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";
import type { TimelineStatus } from "@/components/dashboard/status-timeline";
import { StatusTimeline } from "@/components/dashboard/status-timeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Video, SseVideoEvent } from "@clipflow/types";

interface VideoCardProps {
  video: Video;
  onCancel?: (id: string) => void;
  isCancelling?: boolean;
  /** Latest SSE events for real-time progress display */
  sseEvents?: SseVideoEvent[];
}

/**
 * Map a server-side VideoStatus to the timeline's visual stage.
 *
 * The timeline has 5 user-facing buckets. Multiple backend statuses
 * collapse into a single bucket where the distinction isn't meaningful
 * to the user (e.g. EXTRACTING → TRANSCRIBING → GENERATING all show
 * as "Processing").
 *
 * Failed statuses (PUBLISH_FAILED, FAILED) map to the stage they were
 * in when the failure occurred so the timeline still reflects
 * progress; the error is communicated via the card's red border,
 * failure reason text, and SSE error events.
 */
const mapStatus = (status: Video["status"]): TimelineStatus => {
  switch (status) {
    case "UPLOADED":
    case "READY":
      return "uploaded";
    case "EXTRACTING":
    case "TRANSCRIBING":
    case "GENERATING":
      return "processing";
    case "READY_FOR_REVIEW":
      return "ready_for_review";
    case "SCHEDULED":
    case "PUBLISHING":
    case "PUBLISH_FAILED":
      return "scheduled";
    case "PUBLISHED":
      return "published";
    case "FAILED":
      return "uploaded";
  }
};

const STATUS_LABEL: Record<Video["status"], string> = {
  UPLOADED: "Awaiting upload",
  READY: "Ready to process",
  EXTRACTING: "Extracting audio & frames",
  TRANSCRIBING: "Transcribing",
  GENERATING: "Generating chapters & thumbnails",
  READY_FOR_REVIEW: "Ready for review",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing…",
  PUBLISHED: "Published",
  PUBLISH_FAILED: "Publish failed",
  FAILED: "Processing failed",
};

/**
 * One row in the dashboard video list. Renders the title, status badge,
 * status timeline, and a "View on YouTube" link once published.
 *
 * When `sseEvents` is provided the card picks the latest SSE event for
 * its video ID and renders a live progress bar (PROGRESS) or status
 * indicator (STATUS_UPDATE / ERROR) above the timeline.
 */
export function VideoCard({ video, onCancel, isCancelling, sseEvents }: VideoCardProps) {
  const timelineStatus = mapStatus(video.status);
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
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center",
        video.status === "PUBLISH_FAILED" && "border-destructive/40",
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
          <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
            {video.status === "PUBLISHING" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : video.status === "PUBLISH_FAILED" ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
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
            <h3 className="truncate text-sm font-medium text-foreground">
              <Link
                href={`/dashboard/published/${video.id}`}
                className="rounded-sm outline-none transition-colors hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {video.title}
              </Link>
            </h3>
            <StatusBadge status={video.status} />
          </div>

          {latestSseEvent?.type === "PROGRESS" ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-primary">{latestSseEvent.stage}</span>
                <span className="text-muted-foreground">
                  {latestSseEvent.progress}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${latestSseEvent.progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {latestSseEvent?.type === "ERROR" ? (
            <p className="truncate text-xs text-destructive text-ellipsis">
              Error: {latestSseEvent.error}
            </p>
          ) : null}

          <StatusTimeline status={timelineStatus} />
          {video.failureReason ? (
            <p className="truncate text-xs text-destructive text-ellipsis">
              {video.failureReason}
            </p>
          ) : null}
          {video.scheduledPublishAt && video.status === "SCHEDULED" ? (
            <p className="text-xs text-muted-foreground">
              Will publish {new Date(video.scheduledPublishAt).toLocaleString()}
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
            className="text-muted-foreground hover:text-destructive"
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

function StatusBadge({ status }: { status: Video["status"] }) {
  const className = {
    UPLOADED: "bg-muted text-muted-foreground",
    READY: "bg-muted text-muted-foreground",
    EXTRACTING: "bg-status-processing/15 text-status-processing",
    TRANSCRIBING: "bg-status-processing/15 text-status-processing",
    GENERATING: "bg-status-processing/15 text-status-processing",
    READY_FOR_REVIEW: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    SCHEDULED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    PUBLISHING: "bg-status-processing/15 text-status-processing",
    PUBLISHED: "bg-status-ready/15 text-status-ready",
    PUBLISH_FAILED: "bg-destructive/15 text-destructive",
    FAILED: "bg-destructive/15 text-destructive",
  }[status];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}