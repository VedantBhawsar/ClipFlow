"use client";

import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";
import { useSession } from "next-auth/react";

import { YouTubeConnectCard } from "@/components/dashboard/youtube-connect-card";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { VideoList } from "@/components/dashboard/video-list";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideos } from "@/hooks/use-videos";
import { useVideoSSE } from "@/hooks/use-video-sse";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import {
  FINAL_STATUSES,
  IN_FLIGHT_STATUSES,
  isFailedStatus,
} from "@/lib/video-status";

/**
 * Dashboard home (client component).
 *
 * The "what's in flight" view: uploads mid-processing, scheduled,
 * publishing, or failed. PUBLISHED videos live on `/dashboard/published`.
 *
 * Data flows (all client-side, no SSR fetch):
 *  - Identity fields (name, email) + displayName + onboardingCompleted
 *    come straight from the NextAuth session JWT via `useSession()` —
 *    zero API calls.
 *  - YouTube connection state comes from `useYouTubeConnection()` —
 *    the narrow read owned by the YouTubeConnectCard; the sidebar
 *    subscribes to the same hook so both stay in sync without a
 *    shared cache.
 *  - Videos come from `useVideos({ status: "NOT_PUBLISHED" })` — the
 *    virtual `NOT_PUBLISHED` sentinel translates into a Prisma
 *    `status: { not: "PUBLISHED" }` filter on the server, so the
 *    dashboard never has to hide non-matching rows client-side.
 *  - SSE event stream (`useVideoSSE`) provides real-time progress
 *    updates for video processing. When a STATUS_UPDATE event arrives
 *    the TanStack Query cache is invalidated so the video list
 *    re-fetches with the latest data.
 *  - Safety-net polling: if the SSE silently fails (Redis blip,
 *    dropped EventSource reconnection, channel-prefix drift between
 *    worker + API), a 15 s polling refetch keeps the dashboard honest
 *    while any non-final-status videos are visible. The polling
 *    stops the moment no in-progress videos remain, so it's free in
 *    the steady state.
 *
 * Before the bundle-split refactor this component called
 * `useUserBundle()` to get profile + user + YouTube connection in a
 * single round-trip. That hit cost 2 Prisma queries on every
 * dashboard render. After the refactor identity lives in the session
 * cookie (free) and the YouTube connection is fetched lazily only by
 * the components that actually need it — `useYouTubeConnection()`
 * here and the same hook in the sidebar.
 */

/** Poll cadence for the safety-net refetch. 15 s feels "live" without
 *  hammering the server; this is the fallback that only kicks in when
 *  SSE is broken (the normal path triggers refetches via SSE events). */
const SAFETY_REFETCH_MS = 15_000;

export function DashboardContent() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const videosQuery = useVideos({ status: "NOT_PUBLISHED" });
  const { data: youtubeConnection } = useYouTubeConnection();
  // Memoize so the `hasInFlightVideo` derivation's dep array stays
  // stable across renders — otherwise the safety-net interval below
  // would tear down + recreate every render.
  const videos = useMemo(
    () => videosQuery.data?.videos ?? [],
    [videosQuery.data?.videos],
  );
  const hasUnpublishedVideos = videosQuery.isSuccess && videos.length > 0;
  const sse = useVideoSSE(undefined, { enabled: hasUnpublishedVideos });

  // Open SSE as soon as the user has any unpublished videos — even if
  // they're already past the active stages (e.g. SCHEDULED). The
  // original implementation gated on `hasUnpublishedVideos` too, so
  // the race surface here is the same: SSE reopens when the first
  // fetch returns a non-empty list. The new piece is the safety-net
  // polling below, which catches any STATUS_UPDATE that races past
  // the SSE re-enable.
  const hasInFlightVideo = useMemo(
    () => videos.some((v) => IN_FLIGHT_STATUSES.has(v.status)),
    [videos],
  );

  // Invalidate video list when a STATUS_UPDATE arrives via SSE.
  useEffect(() => {
    const last = sse.events.at(-1);
    if (last?.type === "STATUS_UPDATE") {
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
    }
  }, [sse.events, qc]);

  // Safety-net polling: while any video is still in flight, refetch
  // the list every SAFETY_REFETCH_MS so a missed SSE event can't leave
  // the dashboard stuck on "Transcribing" after the worker already
  // advanced it to GENERATING / READY_FOR_REVIEW. The interval clears
  // the moment no in-flight rows remain — the common case once a
  // video reaches PUBLISHED.
  useEffect(() => {
    if (!hasInFlightVideo) return;
    const timer = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
    }, SAFETY_REFETCH_MS);
    return () => clearInterval(timer);
  }, [hasInFlightVideo, qc]);

  const sessionUser = session?.user ?? null;
  const displayName =
    sessionUser?.displayName?.trim() ||
    sessionUser?.name?.trim() ||
    sessionUser?.email ||
    "creator";
  const firstName = displayName.split(/\s+/)[0] || "creator";
  const channelConnected = youtubeConnection?.status === "connected";

  // Derive the counts that drive both the welcome subline and the
  // <DashboardStats /> row. The "in flight" set is the canonical
  // "still moving" rule; "ready to publish" is the SETTLED-VS-IN-FLIGHT
  // distinction — a video that's finished processing but the user
  // hasn't queued yet (READY_FOR_REVIEW); "failed" is the two error
  // statuses that always need a human.
  const counts = useMemo(() => {
    let inFlight = 0;
    let readyToPublish = 0;
    let failed = 0;
    for (const v of videos) {
      if (FINAL_STATUSES.has(v.status)) continue;
      if (isFailedStatus(v.status)) failed += 1;
      else if (v.status === "READY_FOR_REVIEW") readyToPublish += 1;
      else inFlight += 1;
    }
    return { inFlight, readyToPublish, failed };
  }, [videos]);

  // Welcome subline is data-driven so it's always honest. "Caught up"
  // for the cleared state avoids the "we miss you" tone of a literal
  // "you've got 0 in flight" reading on a quiet day.
  const subline = !videosQuery.isLoading && counts.inFlight === 0 && counts.readyToPublish === 0 && counts.failed === 0
    ? "All caught up — nothing in flight."
    : `You've got ${counts.inFlight} in flight, ${counts.readyToPublish} ready to publish${counts.failed ? `, ${counts.failed} need attention` : ""}.`;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-[28px] font-medium tracking-tight text-[color:var(--ink)]">
              Welcome back, {firstName}.
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-[color:var(--ink-muted)]">
                {subline}
              </p>
              <LiveDot connected={sse.connected} />
            </div>
          </div>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[color:var(--ink-muted)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <SettingsIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Settings
          </Link>
        </div>
      </header>

      <YouTubeConnectCard />

      <DashboardStats
        inFlight={counts.inFlight}
        readyToPublish={counts.readyToPublish}
        failed={counts.failed}
        firstReadyId={videos.find((v) => v.status === "READY_FOR_REVIEW")?.id}
        loading={videosQuery.isLoading}
      />

      <section aria-labelledby="videos-heading" className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2
            id="videos-heading"
            className="text-sm font-semibold uppercase tracking-wide text-[color:var(--ink-muted)]"
          >
            In progress
          </h2>
        </div>

        {videosQuery.isLoading ? (
          <Skeleton className="h-32 bg-[color:var(--surface)]" />
        ) : (
          <VideoList
            videos={videos}
            channelConnected={channelConnected}
            sseEvents={sse.events}
            emptyHint={
              channelConnected
                ? "Up to 5 GB per video. MP4, MOV, or WebM."
                : "Connect your YouTube channel above to get started."
            }
          />
        )}
      </section>
    </div>
  );
}

/**
 * Live SSE indicator. Tokens only — `motion-safe:animate-pulse` so the
 * "live" feel opts out under prefers-reduced-motion (Design.md §5).
 *
 * Two visual states: connected (ready tone, pulsing dot) and offline
 * (muted, static). Both states carry a text label so the state isn't
 * communicated by color alone.
 */
function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        connected
          ? "text-[color:var(--status-ready)]"
          : "text-[color:var(--ink-muted)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${
          connected
            ? "bg-[color:var(--status-ready)] motion-safe:animate-pulse"
            : "bg-[color:var(--line)]"
        }`}
      />
      {connected ? "Live" : "Offline"}
    </span>
  );
}
