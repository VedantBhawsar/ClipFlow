"use client";

import Link from "next/link";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";
import type { Video } from "@clipflow/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

interface PublishedVideoCardProps {
  video: Video;
}

/**
 * One row in the `/dashboard/published` library.
 *
 * Mirrors the dashboard's `<VideoCard />` layout (thumbnail + title +
 * meta + actions) so the visual language stays consistent across the
 * two lists. The published list drops the StatusTimeline strip on
 * purpose — every row here is finished work, so showing pipeline
 * progress is noise.
 *
 * Field choice for a library view (vs. an in-flight row):
 *  - Tags — the primary "scan by topic" affordance for a back-catalog.
 *  - Original filename — lets a creator cross-reference the row with
 *    their local archive ("oh, this is the final-cut-v3 master").
 *  - Privacy pill — distinguishes public vs. unlisted vs. private at
 *    a glance, which is the most-asked state question on this page.
 *  - Audience flags (made-for-kids, comments disabled) — only surfaced
 *    when they differ from defaults so the row stays calm.
 */
export function PublishedVideoCard({ video }: PublishedVideoCardProps) {
  const thumbnailUrl = video.youtubeVideoId
    ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
    : null;
  const publishedLabel = formatDate(video.publishedAt);
  const hasTags = video.tags.length > 0;
  const tagsToShow = video.tags.slice(0, 3);
  const extraTagCount = video.tags.length - tagsToShow.length;

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <Link
        href={`/dashboard/published/${video.id}`}
        aria-label={`Open ${video.title}`}
        className="block shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="h-16 w-28 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-16 w-28 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
            {video.status === "PUBLISHING" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : video.status === "PUBLISH_FAILED" ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : (
              "—"
            )}
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-2">
          {/* Title is the link target — drilling into a video opens
              its detail page. Wrapping just the title (not the whole
              card) so the right-side action buttons stay clickable. */}
          <h3 className="truncate text-sm font-medium text-foreground">
            <Link
              href={`/dashboard/published/${video.id}`}
              className="rounded-sm outline-none transition-colors hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {video.title}
            </Link>
          </h3>
          <PrivacyPill privacy={video.privacyStatus} />
        </div>

        {hasTags ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {tagsToShow.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
            {extraTagCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                +{extraTagCount} more
              </span>
            ) : null}
          </div>
        ) : null}

        <p className="truncate text-xs text-muted-foreground">
          Published {publishedLabel}
          {video.originalFilename ? (
            <>
              {" · "}
              <span className="font-mono" title={video.originalFilename}>
                {video.originalFilename}
              </span>
            </>
          ) : null}
        </p>

        <AudienceFlags video={video} />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
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
      </div>
    </article>
  );
}

// ---------- sub-components ----------

/**
 * Show non-default audience controls so a creator scanning the
 * library can spot "this one's actually for kids" or "comments off"
 * without drilling in. Defaults (madeForKids=false, commentPolicy=
 * "allowAll", embeddable=true) are silent — they're the boring case.
 */
function AudienceFlags({ video }: { video: Video }) {
  const flags: string[] = [];
  if (video.madeForKids) flags.push("Made for kids");
  if (video.commentPolicy === "holdAll") flags.push("Comments held for review");
  if (video.commentPolicy === "disable") flags.push("Comments off");
  if (!video.embeddable) flags.push("Not embeddable");
  if (video.ageRestriction !== "none") flags.push(`Age restricted: ${video.ageRestriction}`);
  if (video.license === "creativeCommon") flags.push("Creative Commons");

  if (flags.length === 0) return null;

  return (
    <p className="text-xs text-muted-foreground">{flags.join(" · ")}</p>
  );
}

function PrivacyPill({ privacy }: { privacy: string }) {
  const className = {
    public: "bg-status-ready/15 text-status-ready",
    unlisted: "bg-muted text-muted-foreground",
    private: "bg-destructive/15 text-destructive",
  }[privacy] ?? "bg-muted text-muted-foreground";
  const label =
    privacy === "public"
      ? "Public"
      : privacy === "unlisted"
        ? "Unlisted"
        : "Private";

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        className,
      )}
    >
      {label}
    </span>
  );
}