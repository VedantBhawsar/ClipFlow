"use client";

import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";
import { useSession } from "next-auth/react";

import { YouTubeConnectCard } from "@/components/dashboard/youtube-connect-card";
import { VideoList } from "@/components/dashboard/video-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideos } from "@/hooks/use-videos";
import { useVideoSSE } from "@/hooks/use-video-sse";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

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
 *
 * Before the bundle-split refactor this component called
 * `useUserBundle()` to get profile + user + YouTube connection in a
 * single round-trip. That hit cost 2 Prisma queries on every
 * dashboard render. After the refactor identity lives in the session
 * cookie (free) and the YouTube connection is fetched lazily only by
 * the components that actually need it — `useYouTubeConnection()`
 * here and the same hook in the sidebar.
 */
export function DashboardContent() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const videosQuery = useVideos({ status: "NOT_PUBLISHED" });
  const { data: youtubeConnection } = useYouTubeConnection();
  const videos = videosQuery.data?.videos ?? [];
  const hasUnpublishedVideos = videosQuery.isSuccess && videos.length > 0;
  const sse = useVideoSSE(undefined, { enabled: hasUnpublishedVideos });

  // Invalidate video list when a STATUS_UPDATE arrives via SSE
  useEffect(() => {
    const last = sse.events.at(-1);
    if (last?.type === "STATUS_UPDATE") {
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
    }
  }, [sse.events, qc]);

  const sessionUser = session?.user ?? null;
  const displayName =
    sessionUser?.displayName?.trim() ||
    sessionUser?.name?.trim() ||
    sessionUser?.email ||
    "creator";
  const firstName = displayName.split(/\s+/)[0] || "creator";
  const channelConnected = youtubeConnection?.status === "connected";

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {firstName}.
        </h1>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Your publishing pipeline, one glance.
          </p>
          <LiveDot connected={sse.connected} />
        </div>
      </header>

      <YouTubeConnectCard />

      <section aria-labelledby="videos-heading" className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2
            id="videos-heading"
            className="text-sm font-semibold text-foreground"
          >
            In progress
          </h2>
        </div>

        {videosQuery.isLoading ? (
          <Skeleton className="h-32 bg-card" />
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

      <section
        aria-labelledby="settings-quick-action"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h2
              id="settings-quick-action"
              className="text-sm font-semibold text-foreground"
            >
              Customize your experience
            </h2>
            <p className="text-xs text-muted-foreground">
              Notifications, scheduling defaults, generation style, and
              more — all in one place.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/settings/profile">
              <SettingsIcon aria-hidden="true" />
              Open settings
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        connected ? "text-green-600" : "text-muted-foreground"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          connected ? "bg-green-500" : "bg-gray-300"
        }`}
      />
      {connected ? "Live" : "Offline"}
    </span>
  );
}
