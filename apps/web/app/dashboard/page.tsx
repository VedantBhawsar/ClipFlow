import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";
import type { UserBundleResponse, Video } from "@clipflow/types";

import { YouTubeConnectCard } from "@/components/dashboard/youtube-connect-card";
import { VideoList } from "@/components/dashboard/video-list";
import { Button } from "@/components/ui/button";
import { AUTH_TOKEN_COOKIE, serverFetch } from "@/lib/api-client";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Dashboard — ClipFlow",
  description: "Your publishing pipeline at a glance.",
};

/**
 * Dashboard home.
 *
 * SSR source of truth. We fetch the user bundle AND the in-progress
 * videos list server-side so the first paint includes the video list
 * with real titles and status badges — no skeleton, no client-side
 * round-trip. The published videos live on a separate page
 * (`/dashboard/published`) so the dashboard stays focused on the
 * "what's in flight" view.
 *
 * v1 states (per AppFlow.md Section 9 + Design.md Section 3):
 * - Header greets the user by display name if set, otherwise neutrally.
 * - Channel-connection card sits at the top of the content area until
 *   the user connects YouTube.
 * - Videos section shows the empty state until the first upload.
 * - A small "Settings" quick-action card sits at the bottom for
 *   users with no videos yet — gives them somewhere to go.
 */
export default async function DashboardPage() {
  // Read the auth cookie server-side. The cookie name is the same
  // one set by the client-side auth context (setAuthTokenCookie).
  // If the cookie is absent, the auth context will redirect on the
  // client — but we read the bundle server-side for a snappier first
  // paint, so we need to handle the no-cookie case here too.
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
  if (!token) {
    redirect("/signin?next=/dashboard");
  }

  let bundle: UserBundleResponse | null = null;
  let videos: Video[] = [];
  try {
    [bundle, videos] = await Promise.all([
      fetchUserBundle(token),
      fetchInProgressVideos(token),
    ]);
  } catch {
    // Stale / invalid cookie — fall through to the unauthenticated
    // state. The client auth refresh will re-attempt and redirect.
    bundle = null;
    videos = [];
  }

  const displayName =
    bundle?.profile?.displayName?.trim() ||
    bundle?.user.name?.trim() ||
    bundle?.user.email ||
    "creator";
  const firstName = displayName.split(/\s+/)[0] || "creator";
  const channelConnected = bundle?.youtubeConnection?.status === "connected";

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

        <VideoList
          videos={videos}
          channelConnected={channelConnected}
          emptyHint={
            channelConnected
              ? "Up to 5 GB per video. MP4, MOV, or WebM."
              : "Connect your YouTube channel above to get started."
          }
        />
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

/**
 * Fetch the user bundle using a JWT read from the request cookie.
 * Bypasses the api-client's `document.cookie` lookup (which is
 * browser-only) and calls the backend directly so the page can
 * render server-side.
 */
async function fetchUserBundle(token: string): Promise<UserBundleResponse> {
  const res = await fetch(`${env.apiBaseUrl}/api/user/profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`bundle fetch failed: ${res.status}`);
  }
  return (await res.json()) as UserBundleResponse;
}

/**
 * Fetch the in-progress videos for the SSR dashboard.
 *
 * The dashboard is the "what's in flight" view — uploads that are
 * mid-processing, scheduled, publishing, or failed. PUBLISHED videos
 * live on `/dashboard/published` so they don't double-render here.
 *
 * In v1 we achieve the "exclude PUBLISHED" semantics client-side by
 * pulling the full list and filtering in JS — the volume per user is
 * tiny (tens, not thousands), and keeping a single endpoint keeps the
 * route table simple. A future slice can add a server-side filter
 * (`?status=NOT_PUBLISHED`) and drop the JS filter.
 */
async function fetchInProgressVideos(token: string): Promise<Video[]> {
  try {
    const data = await serverFetch<{ videos: Video[] }>(token, "/api/videos");
    return data.videos.filter((v) => v.status !== "PUBLISHED");
  } catch {
    return [];
  }
}
