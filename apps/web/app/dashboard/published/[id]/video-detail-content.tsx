"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, AlertCircle } from "lucide-react";
import type {
  Video,
  VideoPrivacyStatus,
  VideoStatus,
} from "@clipflow/types";

import { StatusTimeline } from "@/components/dashboard/status-timeline";
import { VideoDetailLiveProgress } from "@/components/dashboard/video-detail-live-progress";
import { VideoPlayer } from "@/components/review/video-player";
import { VideoReviewPanel } from "@/components/review/video-review-panel";
import { ThumbnailReviewPanel } from "@/components/review/thumbnail-review-panel";
import type { ThumbnailOption } from "@/components/review/thumbnail-card";
import { UnpublishButton } from "@/app/dashboard/published/[id]/unpublish-button";
import { CancelButton } from "@/app/dashboard/published/[id]/cancel-button";
import { EditDetailsButton } from "@/app/dashboard/published/[id]/edit-details-button";
import { PublishButton } from "@/app/dashboard/published/[id]/publish-button";
import { RetryButton } from "@/app/dashboard/published/[id]/retry-button";
import { StatusPill } from "@/components/dashboard/status-pill";
import { DetailRow, EmptyValue } from "@/components/dashboard/detail-row";
import { Button } from "@/components/ui/button";
import BackButton from "@/components/shared/BackButton";
import { useVideoDetail } from "@/hooks/use-videos";
import { queryKeys } from "@/lib/query-keys";
import {
  STATUS_LABEL,
  isFailedStatus,
  mapTimelineStatus,
} from "@/lib/video-status";
import {
  formatBytes,
  formatCommentPolicy,
  formatDuration,
  formatLicense,
  formatPrivacy,
} from "@/lib/voice";
import { friendlyError } from "@/lib/friendly-error";

interface VideoDetailContentProps {
  videoId: string;
  initialVideo: Video;
  channelConnected: boolean;
}

export function VideoDetailContent({
  videoId,
  initialVideo,
  channelConnected,
}: VideoDetailContentProps) {
  const qc = useQueryClient();
  const { data: video } = useVideoDetail(videoId, initialVideo);

  // Listen for SSE-driven status changes to invalidate the detail query
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.videoId === videoId) {
        qc.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) });
      }
    };
    window.addEventListener("video-status-changed", handler as EventListener);
    return () =>
      window.removeEventListener(
        "video-status-changed",
        handler as EventListener,
      );
  }, [videoId, qc]);

  // Guard — should never hit due to initialData, but satisfies TS
  if (!video) return null;

  const timelineStatus = mapTimelineStatus(video.status);
  const hasError = isFailedStatus(video.status);
  const publishedThumbnail = video.youtubeVideoId
    ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
    : null;
  const thumbnailOptions = buildThumbnailOptions(video, publishedThumbnail);
  const interactiveThumbnailStatuses: ReadonlySet<VideoStatus> = new Set([
    "READY_FOR_REVIEW",
    "PUBLISH_FAILED",
  ]);
  const thumbnailsInteractive = interactiveThumbnailStatuses.has(
    video.status as VideoStatus,
  );
  const inFlight = video.status !== "PUBLISHED";

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <BackButton className="mb-1 block">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-[color:var(--ink-muted)]"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back
          </Button>
        </BackButton>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-medium leading-tight tracking-tight text-[color:var(--ink)]">
                {video.title}
              </h1>
              <StatusPill status={video.status} />
            </div>
            <p className="text-[12px] text-[color:var(--ink-muted)]">
              Last updated{" "}
              <span className="font-mono tabular-nums">
                {new Date(video.updatedAt).toLocaleString()}
              </span>
            </p>
          </div>

          <ActionPanel video={video} channelConnected={channelConnected} />
        </div>
      </header>

      <section
        aria-labelledby="status-heading"
        className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-5"
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div className="space-y-0.5">
            <h2
              id="status-heading"
              className="text-[13px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]"
            >
              Pipeline
            </h2>
            <p className="text-[14px] text-[color:var(--ink)]">
              {STATUS_LABEL[video.status]}
            </p>
          </div>
          {video.scheduledPublishAt && video.status === "SCHEDULED" ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">
              Publishes{" "}
              <span className="font-mono tabular-nums text-[color:var(--ink)]">
                {new Date(video.scheduledPublishAt).toLocaleString()}
              </span>
            </p>
          ) : null}
          {video.publishedAt ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">
              Published{" "}
              <span className="font-mono tabular-nums text-[color:var(--ink)]">
                {new Date(video.publishedAt).toLocaleString()}
              </span>
            </p>
          ) : null}
        </div>

        <StatusTimeline status={timelineStatus} hasError={hasError} />

        {video.failureReason ? (
          (() => {
            const friendly = friendlyError(video.failureReason);
            return (
              <div className="mt-4 flex items-start gap-2 text-[13px] text-[color:var(--status-error)]">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block">{friendly.message}</span>
                  <span className="mt-0.5 block text-[12px] text-[color:var(--ink-muted)]">
                    Failed during {friendly.stepLabel}
                  </span>
                  {friendly.hint ? (
                    <span className="mt-1 block text-[12px] text-[color:var(--ink-muted)]">
                      {friendly.hint}
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })()
        ) : video.status === "GENERATING" ? (
          <div className="mt-4 flex items-start gap-2 text-[13px] text-[color:var(--status-error)]">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block">Thumbnail generation failed.</span>
              <span className="mt-0.5 block text-[12px] text-[color:var(--ink-muted)]">
                Failed during thumbnail generation — chapters are done.
              </span>
              <span className="mt-1 block text-[12px] text-[color:var(--ink-muted)]">
                Try again — the retry will pick up from the thumbnail step.
              </span>
            </span>
          </div>
        ) : null}

        {inFlight ? (
          <div className="mt-4 border-t border-[color:var(--line)] pt-3">
            <VideoDetailLiveProgress videoId={video.id} />
          </div>
        ) : null}
      </section>

      {video.chaptersJson ? (
        <VideoReviewPanel
          videoId={video.id}
          chaptersJson={video.chaptersJson}
          durationSeconds={video.durationSeconds}
          readOnly={video.status !== "READY_FOR_REVIEW"}
        />
      ) : video.durationSeconds ? (
        <VideoPlayerStandalone
          videoId={video.id}
          status={video.status}
        />
      ) : null}

      <ThumbnailReviewPanel
        videoId={video.id}
        options={thumbnailOptions}
        initialSelectedId={video.selectedThumbnailId ?? null}
        regenerationsUsed={0}
        regenerationsAllowed={5}
        disabled={!thumbnailsInteractive}
      />

      <section
        aria-labelledby="metadata-heading"
        className="mx-0 max-w-[60rem]"
      >
        <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-5">
          <h2
            id="metadata-heading"
            className="mb-4 text-[13px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]"
          >
            Details
          </h2>
          <dl className="grid gap-x-8 gap-y-4 text-[14px] sm:grid-cols-2">
            <DetailRow label="Description" span={2}>
              {video.description ? (
                <p className="whitespace-pre-wrap text-[color:var(--ink)]/85">
                  {video.description}
                </p>
              ) : (
                <EmptyValue />
              )}
            </DetailRow>
            <DetailRow label="Tags" span={2}>
              {video.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {video.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-[color:var(--line)] px-2 py-0.5 text-[12px] text-[color:var(--ink)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyValue />
              )}
            </DetailRow>
            <DetailRow label="Privacy">
              {formatPrivacy(video.privacyStatus as VideoPrivacyStatus)}
            </DetailRow>
            <DetailRow label="Audience">
              {video.madeForKids ? "Made for kids" : "Not made for kids"}
              {video.ageRestriction !== "none" ? (
                <span className="ml-2 text-[color:var(--ink-muted)]">
                  · age restricted (18+)
                </span>
              ) : null}
            </DetailRow>
            <DetailRow label="Comments">
              {formatCommentPolicy(video.commentPolicy)}
            </DetailRow>
            <DetailRow label="Embedding">
              {video.embeddable
                ? "Other sites can embed this video"
                : "Embedding disabled"}
            </DetailRow>
            <DetailRow label="License">
              {formatLicense(video.license)}
            </DetailRow>
            <DetailRow label="Public stats">
              {video.publicStatsViewable
                ? "View count visible on watch page"
                : "View count hidden from public"}
            </DetailRow>
          </dl>

          <div className="mt-6 border-t border-[color:var(--line)] pt-4">
            <h3 className="mb-3 text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
              Technical
            </h3>
            <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
              <DetailRow label="File" muted>
                <span className="font-mono text-[12px] tabular-nums">
                  {video.originalFilename} · {formatBytes(video.fileSizeBytes)}
                </span>
              </DetailRow>
              {video.durationSeconds != null ? (
                <DetailRow label="Duration" muted>
                  <span className="font-mono text-[12px] tabular-nums">
                    {formatDuration(video.durationSeconds)}
                  </span>
                </DetailRow>
              ) : null}
              <DetailRow label="Video ID" muted>
                <span className="font-mono text-[12px]">{video.id}</span>
              </DetailRow>
              {video.retryCount != null && video.retryCount > 0 ? (
                <DetailRow label="Retries" muted>
                  <span className="font-mono text-[12px]">
                    {video.retryCount} / 4
                  </span>
                </DetailRow>
              ) : null}
              {video.youtubeVideoId ? (
                <DetailRow label="YouTube ID" muted>
                  <span className="font-mono text-[12px]">
                    {video.youtubeVideoId}
                  </span>
                </DetailRow>
              ) : null}
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------- standalone video player (processing state) ----------

function VideoPlayerStandalone({
  videoId,
  status,
}: {
  videoId: string;
  status: string;
}) {
  return (
    <section
      aria-labelledby="video-heading"
      className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2
          id="video-heading"
          className="text-[16px] font-medium text-[color:var(--ink)]"
        >
          Video
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--accent)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)] motion-safe:animate-pulse" />
          {STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}
        </span>
      </div>
      <VideoPlayer videoId={videoId} chaptersJson={null} />
    </section>
  );
}

// ---------- sub-components ----------

function ActionPanel({
  video,
  channelConnected,
}: {
  video: Video;
  channelConnected: boolean;
}) {
  const canCancel = [
    "UPLOADED",
    "READY",
    "SCHEDULED",
    "PUBLISH_FAILED",
  ].includes(video.status);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {video.status === "READY_FOR_REVIEW" ? (
        <EditDetailsButton
          video={{
            id: video.id,
            title: video.title,
            description: video.description,
            tags: video.tags,
            privacyStatus: video.privacyStatus as VideoPrivacyStatus,
            madeForKids: video.madeForKids,
            embeddable: video.embeddable,
            license: video.license,
            publicStatsViewable: video.publicStatsViewable,
            commentPolicy: video.commentPolicy,
          }}
        />
      ) : null}
      {channelConnected &&
      (video.status === "READY_FOR_REVIEW" ||
        video.status === "PUBLISH_FAILED") ? (
        <PublishButton
          video={{
            id: video.id,
            title: video.title,
            privacyStatus: video.privacyStatus,
          }}
        />
      ) : null}
      {video.youtubeVideoId ? (
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://youtu.be/${video.youtubeVideoId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            View on YouTube
          </a>
        </Button>
      ) : null}
      {channelConnected && video.status === "PUBLISHED" ? (
        <UnpublishButton videoId={video.id} />
      ) : null}
      {video.status === "FAILED" || video.status === "GENERATING" ? (
        <RetryButton
          videoId={video.id}
          videoTitle={video.title}
          status={video.status}
          failureReason={video.failureReason}
          retryCount={video.retryCount}
        />
      ) : null}
      {canCancel ? <CancelButton videoId={video.id} /> : null}
    </div>
  );
}

// ---------- helpers ----------

function buildThumbnailOptions(
  video: Video,
  publishedThumbnail: string | null,
): ThumbnailOption[] {
  const options: ThumbnailOption[] = [];

  for (const t of video.thumbnails) {
    options.push({
      id: t.id,
      src: t.url,
      alt: `Thumbnail candidate for "${video.title}"`,
      label: t.label,
    });
  }

  if (options.length === 0 && publishedThumbnail) {
    options.push({
      id: "youtube-generated",
      src: publishedThumbnail,
      alt: `YouTube-generated thumbnail for "${video.title}"`,
      label: "YouTube default",
    });
  }

  while (options.length < 4) {
    options.push({
      id: `slot-${options.length}`,
      src: null,
      alt: "",
      label: `Candidate ${options.length + 1}`,
    });
  }

  return options;
}
