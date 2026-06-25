import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import type { Video, VideoStatus } from "@clipflow/types";

import {
  StatusTimeline,
  type TimelineStatus,
} from "@/components/dashboard/status-timeline";
import { UnpublishButton } from "@/app/dashboard/published/[id]/unpublish-button";
import { CancelButton } from "@/app/dashboard/published/[id]/cancel-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { serverFetch, ServerApiError } from "@/lib/api-client";
import BackButton from "@/components/shared/BackButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Video — ClipFlow",
  description: "Video details and publishing controls.",
};

const STATUS_LABEL: Record<VideoStatus, string> = {
  UPLOADED: "Awaiting upload",
  READY: "Ready to publish",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing…",
  PUBLISHED: "Published",
  PUBLISH_FAILED: "Publish failed",
};

/**
 * Same mapping the dashboard's `VideoCard` uses — keep the visual
 * language consistent across row and detail page so the timeline
 * reads the same way in both views.
 */
const mapStatus = (status: Video["status"]): TimelineStatus => {
  switch (status) {
    case "UPLOADED":
    case "READY":
    case "PUBLISH_FAILED":
      return "uploaded";
    case "SCHEDULED":
    case "PUBLISHING":
      return "scheduled";
    case "PUBLISHED":
      return "published";
  }
};

/**
 * `/dashboard/videos/:id` — full detail view for a single video.
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
    // Anything else (network / 500) — render a minimal fallback so
    // the chrome (sidebar, back link) still works and the user can
    // navigate away. The server component boundary will surface the
    // real error to the error overlay in dev.
    video = null;
  }

  if (!video) {
    notFound();
  }

  const timelineStatus = mapStatus(video.status);
  const thumbnailUrl = video.youtubeVideoId
    ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
    : null;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <BackButton className={"mb-2"}>
            <Button variant="ghost" size="sm" className="-ml-2">
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          </BackButton>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {video.title}
            </h1>
            <StatusBadge status={video.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Last updated {new Date(video.updatedAt).toLocaleString()}
          </p>
        </div>

        <ActionPanel video={video} />
      </header>

      <section
        aria-labelledby="status-heading"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2 id="status-heading" className="sr-only">
          Pipeline status
        </h2>
        <StatusTimeline status={timelineStatus} className="max-w-2xl" />
        {video.failureReason ? (
          <p className="mt-3 text-xs text-destructive">
            <AlertCircle
              className="mr-1 inline h-3.5 w-3.5"
              aria-hidden="true"
            />
            {video.failureReason}
          </p>
        ) : null}
        {video.scheduledPublishAt && video.status === "SCHEDULED" ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Will publish {new Date(video.scheduledPublishAt).toLocaleString()}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="thumbnail-heading"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2
          id="thumbnail-heading"
          className="mb-3 text-sm font-semibold text-foreground"
        >
          Thumbnail
        </h2>
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="h-32 w-56 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-32 w-56 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
            {video.status === "PUBLISHING" ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              "—"
            )}
          </div>
        )}
      </section>

      <section
        aria-labelledby="metadata-heading"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2
          id="metadata-heading"
          className="mb-4 text-sm font-semibold text-foreground"
        >
          Details
        </h2>
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <DetailRow label="Description">
            {video.description ? (
              <p className="whitespace-pre-wrap text-foreground/90">
                {video.description}
              </p>
            ) : (
              <EmptyValue />
            )}
          </DetailRow>
          <DetailRow label="Tags">
            {video.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {video.tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyValue />
            )}
          </DetailRow>
          <DetailRow label="Category">
            <span className="font-mono text-xs">{video.categoryId}</span>
          </DetailRow>
          <DetailRow label="Privacy">
            <span className="capitalize">{video.privacyStatus}</span>
          </DetailRow>
          <DetailRow label="Audience">
            {video.madeForKids ? "Made for kids" : "Not made for kids"}
            {video.ageRestriction !== "none" && (
              <span className="ml-2 text-muted-foreground">
                · age {video.ageRestriction}
              </span>
            )}
          </DetailRow>
          <DetailRow label="Distribution">
            <ul className="space-y-0.5">
              <li>{video.embeddable ? "Embeddable" : "Not embeddable"}</li>
              <li>
                License:{" "}
                <span className="font-mono text-xs">{video.license}</span>
              </li>
              <li>
                {video.publicStatsViewable
                  ? "Public stats viewable"
                  : "Stats hidden from public"}
              </li>
            </ul>
          </DetailRow>
          <DetailRow label="Comments">
            <span className="font-mono text-xs">{video.commentPolicy}</span>
          </DetailRow>
          <DetailRow label="File">
            <span className="font-mono text-xs">
              {video.originalFilename} · {formatBytes(video.fileSizeBytes)}
            </span>
          </DetailRow>
          {video.scheduledPublishAt ? (
            <DetailRow label="Scheduled">
              {new Date(video.scheduledPublishAt).toLocaleString()}
            </DetailRow>
          ) : null}
          {video.publishedAt ? (
            <DetailRow label="Published">
              {new Date(video.publishedAt).toLocaleString()}
            </DetailRow>
          ) : null}
        </dl>
      </section>
    </div>
  );
}

async function fetchVideo(token: string, id: string): Promise<Video> {
  return serverFetch<Video>(token, `/api/videos/${id}`);
}

// ---------- sub-components ----------

function StatusBadge({ status }: { status: VideoStatus }) {
  const className = {
    UPLOADED: "bg-muted text-muted-foreground",
    READY: "bg-status-processing/15 text-status-processing",
    SCHEDULED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    PUBLISHING: "bg-status-processing/15 text-status-processing",
    PUBLISHED: "bg-status-ready/15 text-status-ready",
    PUBLISH_FAILED: "bg-destructive/15 text-destructive",
  }[status];
  return (
    <span
      className={
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
        className
      }
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground">—</span>;
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
      {/* TODO: Retry button — needs POST /api/videos/:id/retry.
          Adding a retry endpoint requires deciding whether the worker
          picks it up via BullMQ or the API re-enqueues inline; defer
          until the next slice. */}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${n} B`;
}
