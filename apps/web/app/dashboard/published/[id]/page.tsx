import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, AlertCircle } from "lucide-react";
import type {
  Video,
  VideoPrivacyStatus,
  VideoStatus,
} from "@clipflow/types";

import {
  StatusTimeline,
  type TimelineStatus,
} from "@/components/dashboard/status-timeline";
import { VideoDetailLiveProgress } from "@/components/dashboard/video-detail-live-progress";
import { VideoReviewPanel } from "@/components/review/video-review-panel";
import { ThumbnailReview } from "@/components/review/thumbnail-review";
import type { ThumbnailOption } from "@/components/review/thumbnail-card";
import { UnpublishButton } from "@/app/dashboard/published/[id]/unpublish-button";
import { CancelButton } from "@/app/dashboard/published/[id]/cancel-button";
import { EditDetailsButton } from "@/app/dashboard/published/[id]/edit-details-button";
import { PublishButton } from "@/app/dashboard/published/[id]/publish-button";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { serverFetch, ServerApiError } from "@/lib/api-client";
import BackButton from "@/components/shared/BackButton";
import { cn } from "@/lib/utils";
import {
  formatBytes,
  formatCommentPolicy,
  formatDuration,
  formatLicense,
  formatPrivacy,
} from "@/lib/voice";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Video — ClipFlow",
  description: "Video details and publishing controls.",
};

/**
 * User-facing labels for each backend `VideoStatus`. Design.md
 * Section 4 (voice + copy): active voice, plain verbs, no jargon.
 * Every status has a text label — never signal state by color alone.
 */
const STATUS_LABEL: Record<VideoStatus, string> = {
  UPLOADED: "Awaiting upload",
  READY: "Ready to process",
  EXTRACTING: "Extracting audio & frames",
  TRANSCRIBING: "Transcribing",
  GENERATING: "Generating chapters & thumbnails",
  READY_FOR_REVIEW: "Ready for your review",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  PUBLISH_FAILED: "Publish failed",
  FAILED: "Processing failed",
};

/**
 * Which token drives the status label chip. Uses `--status-*` variables
 * from Design.md Section 2 — no ad-hoc palette.
 */
const STATUS_TONE: Record<VideoStatus, "processing" | "ready" | "scheduled" | "error" | "neutral"> = {
  UPLOADED: "neutral",
  READY: "neutral",
  EXTRACTING: "processing",
  TRANSCRIBING: "processing",
  GENERATING: "processing",
  READY_FOR_REVIEW: "ready",
  SCHEDULED: "scheduled",
  PUBLISHING: "processing",
  PUBLISHED: "ready",
  PUBLISH_FAILED: "error",
  FAILED: "error",
};

/**
 * Same mapping the dashboard's `VideoCard` uses — keep the visual
 * language consistent across row and detail page so the timeline reads
 * the same way in both views.
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
      return "processing";
  }
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
  try {
    video = await fetchVideo(token, id);
  } catch (err) {
    if (err instanceof ServerApiError && err.status === 404) {
      notFound();
    }
    video = null;
  }

  if (!video) {
    notFound();
  }

  const timelineStatus = mapStatus(video.status);
  const hasError = video.status === "FAILED" || video.status === "PUBLISH_FAILED";
  const publishedThumbnail = video.youtubeVideoId
    ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
    : null;
  const thumbnailOptions = buildThumbnailOptions(video, publishedThumbnail);
  const selectedThumbnailId =
    thumbnailOptions.find((t) => t.src != null)?.id ?? thumbnailOptions[0]?.id;
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

          <ActionPanel video={video} />
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
          <p className="mt-4 flex items-start gap-2 text-[13px] text-[color:var(--status-error)]">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {video.failureReason}
          </p>
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
      <ThumbnailReview
        options={thumbnailOptions}
        selectedId={selectedThumbnailId}
        regenerationsUsed={0}
        regenerationsAllowed={5}
        disabled
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

// ---------- sub-components ----------

/**
 * Status pill using Design.md's token palette — no ad-hoc colors.
 * Text label is always present so state is not communicated by color
 * alone (Section 6).
 */
function StatusPill({ status }: { status: VideoStatus }) {
  const tone = STATUS_TONE[status];
  const cls = {
    processing:
      "bg-[color:var(--status-processing)]/12 text-[color:var(--status-processing)]",
    ready:
      "bg-[color:var(--status-ready)]/12 text-[color:var(--status-ready)]",
    scheduled:
      "bg-[color:var(--status-scheduled)]/12 text-[color:var(--status-scheduled)]",
    error:
      "bg-[color:var(--status-error)]/12 text-[color:var(--status-error)]",
    neutral:
      "bg-[color:var(--muted)] text-[color:var(--ink-muted)]",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        cls,
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full bg-current",
          tone === "processing" && "motion-safe:animate-pulse",
        )}
        aria-hidden="true"
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function DetailRow({
  label,
  children,
  span,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  span?: 2;
  muted?: boolean;
}) {
  return (
    <div className={cn("space-y-1", span === 2 && "sm:col-span-2")}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
        {label}
      </dt>
      <dd
        className={cn(
          muted ? "text-[color:var(--ink-muted)]" : "text-[color:var(--ink)]",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-[color:var(--ink-muted)]">—</span>;
}

function ActionPanel({ video }: { video: Video }) {
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
      {video.status === "READY_FOR_REVIEW" || video.status === "PUBLISH_FAILED" ? (
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
      {video.status === "PUBLISHED" ? (
        <UnpublishButton videoId={video.id} />
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
 * The v1 data model persists a single custom thumbnail (`s3KeyThumbnail`)
 * plus, once published, YouTube's own generated frame — we render both
 * as the "selected" and "AI candidate" slots respectively, and pad the
 * grid with empty slots so the layout is always the same 4-up grid
 * across statuses. Empty slots carry the copy Design.md Section 4
 * calls for ("Regenerate to fill") instead of showing a raw placeholder
 * image.
 *
 * The 5-regeneration cap is v1's default tier limit; when tier data
 * lives in the DB (v1.5 billing slice), the page will pass real values.
 */
function buildThumbnailOptions(
  video: Video,
  publishedThumbnail: string | null,
): ThumbnailOption[] {
  const options: ThumbnailOption[] = [];

  if (video.s3KeyThumbnail) {
    options.push({
      id: "user-upload",
      src: publishedThumbnail ?? null,
      alt: `Your custom thumbnail for "${video.title}"`,
      label: "Your upload",
    });
  }

  if (publishedThumbnail && !video.s3KeyThumbnail) {
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
