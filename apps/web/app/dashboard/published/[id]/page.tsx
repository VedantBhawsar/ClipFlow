import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, AlertCircle } from "lucide-react";
import type {
  Video,
  VideoPrivacyStatus,
  VideoStatus,
  YouTubeConnection,
} from "@clipflow/types";

import {
  StatusTimeline,
} from "@/components/dashboard/status-timeline";
import { VideoDetailLiveProgress } from "@/components/dashboard/video-detail-live-progress";
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
import { auth } from "@/auth";
import { serverFetch, ServerApiError } from "@/lib/api-client";
import BackButton from "@/components/shared/BackButton";
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

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Video — ClipFlow",
  description: "Video details and publishing controls.",
};

/**
 * `/dashboard/published/:id` — full detail view for a single video.
 *
 * Server-rendered so the page is meaningful on first paint (no client
 * round-trip for the initial read).
 *
 * Auth: NextAuth's `auth()` reads its httpOnly session cookie, runs
 * the `jwt` callback (silent refresh if needed), and hands us the
 * access token. We forward it to Express via `serverFetch`.
 *
 * 404 from the API → `notFound()` so unknown / foreign ids render the
 * dashboard's standard not-found state instead of a 500.
 */
export default async function VideoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const token = session?.accessToken ?? null;
  if (!token) {
    redirect(`/signin?next=/dashboard/videos/${id}`);
  }

  let video: Video | null = null;
  let channelConnected = false;
  try {
    video = await fetchVideo(token, id);
    const connection = await fetchYouTubeConnection(token);
    channelConnected = connection?.status === "connected";

    console.log("video" , video)
  } catch (err) {
    if (err instanceof ServerApiError && err.status === 404) {
      notFound();
    }
    video = null;
  }

  if (!video) {
    notFound();
  }

  const timelineStatus = mapTimelineStatus(video.status);
  const hasError = isFailedStatus(video.status);
  const publishedThumbnail = video.youtubeVideoId
    ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
    : null;
  const thumbnailOptions = buildThumbnailOptions(video, publishedThumbnail);
  // The user can only pick / regenerate while the video is in a
  // review-window state. Once it's published (or stuck mid-flight),
  // the grid is read-only context.
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

      {/* Pipeline status strip — the signature element, per Design.md
          Section 2. */}
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
              <span className="block">
                Thumbnail generation failed.
              </span>
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

      {video.status === "READY_FOR_REVIEW" && video.chaptersJson ? (
        <VideoReviewPanel
          videoId={video.id}
          chaptersJson={video.chaptersJson}
          durationSeconds={video.durationSeconds}
        />
      ) : null}

      {/* Thumbnails grid — always visible on the detail page. The
          selected tile is the one actually going to YouTube. */}
      <ThumbnailReviewPanel
        videoId={video.id}
        options={thumbnailOptions}
        initialSelectedId={video.selectedThumbnailId ?? null}
        regenerationsUsed={0}
        regenerationsAllowed={5}
        disabled={!thumbnailsInteractive}
      />

      {/* Details — text-heavy content, capped at the ~960px column
          rule from Design.md Section 2. */}
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

          {/* Technical block — kept at the bottom, mono, muted, so
              the primary view stays creator-facing (Design.md Section
              4). */}
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

async function fetchVideo(token: string, id: string): Promise<Video> {
  return serverFetch<Video>(token, `/api/videos/${id}`);
}

async function fetchYouTubeConnection(
  token: string,
): Promise<YouTubeConnection | null> {
  try {
    return await serverFetch<YouTubeConnection>(
      token,
      "/api/youtube/connection",
    );
  } catch {
    return null;
  }
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
      (video.status === "READY_FOR_REVIEW" || video.status === "PUBLISH_FAILED") ? (
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

// ---------- formatters (Voice + Copy, Design.md Section 4) ----------
//
// `formatBytes`, `formatCommentPolicy`, `formatDuration`,
// `formatLicense`, and `formatPrivacy` were lifted to
// `apps/web/lib/voice.ts` when the Publish sheet needed
// `formatPrivacy` (cerebrum 2026-07-02: "When a second page needs
// the same formatter, lift it to `apps/web/lib/voice.ts`"). The page
// now imports them from there.

/**
 * Build the thumbnail candidate slots shown in the review grid.
 *
 * Reads from `video.thumbnails[]` (populated by the API's `getVideo`
 * with fresh presigned GET URLs + user-facing labels). The grid is
 * padded to 4 slots with empty placeholders so the layout stays the
 * same across statuses — Design.md Section 4 calls for "Regenerate
 * to fill" copy on empty slots rather than raw placeholder images.
 *
 * For PUBLISHED videos without any persisted thumbnail row (rare:
 * would mean the row was published before the thumbnail feature
 * shipped), we fall back to YouTube's auto-generated poster so the
 * grid still shows one tile instead of four empty ones.
 *
 * The 5-regeneration cap is v1's default tier limit; when tier data
 * lives in the DB (v1.5 billing slice), the page will pass real values.
 */
function buildThumbnailOptions(
  video: Video,
  publishedThumbnail: string | null,
): ThumbnailOption[] {
  const options: ThumbnailOption[] = [];

  // First pass: every persisted thumbnail row (USER_UPLOADED +
  // AI_GENERATED). The server already sorted them with the user's
  // upload on top and AI candidates numbered 1..N.
  for (const t of video.thumbnails) {
    options.push({
      id: t.id,
      src: t.url,
      alt: `Thumbnail candidate for "${video.title}"`,
      label: t.label,
    });
  }

  // Fallback for PUBLISHED rows with no thumbnail row (legacy or
  // pre-feature). YouTube's auto-generated frame is what the watch
  // page is showing today — at least render that one tile.
  if (options.length === 0 && publishedThumbnail) {
    options.push({
      id: "youtube-generated",
      src: publishedThumbnail,
      alt: `YouTube-generated thumbnail for "${video.title}"`,
      label: "YouTube default",
    });
  }

  // Pad to a stable 4-tile grid so the layout doesn't jump between
  // statuses.
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
