"use client";

import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";

import { YouTubeConnectCard } from "@/components/dashboard/youtube-connect-card";
import { VideoList } from "@/components/dashboard/video-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserBundle } from "@/hooks/use-user-bundle";
import { useVideos } from "@/hooks/use-videos";

/**
 * Dashboard home (client component).
 *
 * The "what's in flight" view: uploads mid-processing, scheduled,
 * publishing, or failed. PUBLISHED videos live on `/dashboard/published`.
 *
 * Data flows (all client-side, no SSR fetch):
 *  - User / profile / YouTube connection come from `useUserBundle()` —
 *    the same TanStack Query cache that `AuthProvider` warms on mount
 *    and that the sidebar + YouTubeConnectCard already subscribe to.
 *    No duplicate request; no new endpoint needed.
 *  - Videos come from `useVideos()` — the existing query hook used by
 *    other client surfaces. PUBLISHED is filtered out in JS; volume
 *    per user is small enough that this is fine for v1 (a future slice
 *    can add `?status=NOT_PUBLISHED` server-side and drop the filter).
 *
 * Why client (not SSR like before): the SSR shell was awaiting
 * `Promise.all([fetchUserBundle, fetchInProgressVideos])` server-side.
 * When the bundle endpoint was slow the browser got nothing — no
 * Loading… placeholder, no header, no skeleton — just a blank page
 * until the server eventually responded. Moving the fetches into
 * TanStack Query lets the AuthGuard render its Loading… placeholder
 * immediately while data arrives in the background.
 */
export function DashboardContent() {
  const bundle = useUserBundle();
  const videosQuery = useVideos();

  const user = bundle.data?.user ?? null;
  const profile = bundle.data?.profile ?? null;
  const youtubeConnection = bundle.data?.youtubeConnection ?? null;

  const displayName =
    profile?.displayName?.trim() ||
    user?.name?.trim() ||
    user?.email ||
    "creator";
  const firstName = displayName.split(/\s+/)[0] || "creator";
  const channelConnected = youtubeConnection?.status === "connected";

  const videos = (videosQuery.data?.videos ?? []).filter(
    (v) => v.status !== "PUBLISHED",
  );

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground">
          Your publishing pipeline, one glance.
        </p>
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
