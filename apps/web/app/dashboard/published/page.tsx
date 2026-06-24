import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Video } from "@clipflow/types";

import { VideoList } from "@/components/dashboard/video-list";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { serverFetch } from "@/lib/api-client";

export const metadata: Metadata = {
  title: "Published — ClipFlow",
  description: "Your published video library.",
};

/**
 * `/dashboard/published` — the user's library of videos already on
 * YouTube. Server-rendered so the first paint is meaningful (no
 * client round-trip for the initial list).
 *
 * Companion page to `/dashboard`: that page is the "what's in flight"
 * view (uploads, scheduled, failed); this page is the "what's live"
 * view. Both source from the same `videos` table; the split is by
 * `status === "PUBLISHED"`.
 *
 * The `VideoList` component handles its own empty state — distinct
 * copy here ("no published videos yet") but the same shell so the
 * create-video CTA is always one click away.
 *
 * Server-side auth: NextAuth's `auth()` reads its own httpOnly session
 * cookie, runs the `jwt` callback (which may refresh the access token
 * silently), and returns the session object. We pull
 * `session.accessToken` and pass it as the bearer token to
 * `serverFetch`. There's no cookie-name coupling between this file
 * and NextAuth internals.
 */
export default async function PublishedPage() {
  const session = await auth();
  const token = session?.accessToken ?? null;
  if (!token) {
    redirect("/signin?next=/dashboard/published");
  }

  let videos: Video[] = [];
  try {
    videos = await fetchPublishedVideos(token);
  } catch {
    videos = [];
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Published</h1>
          <p className="text-sm text-muted-foreground">
            Videos that have been published to your YouTube channel.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <ArrowLeft aria-hidden="true" />
            Back to dashboard
          </Link>
        </Button>
      </header>

      <section aria-labelledby="published-heading" className="space-y-4">
        <h2 id="published-heading" className="sr-only">
          Published videos
        </h2>
        <VideoList
          videos={videos}
          // The create CTA stays visible on the published page; if
          // the user wants to drop a new video from here, they can.
          // We just pass `true` because the channel-connection gate
          // only matters for the upload itself — the page is still
          // viewable without a channel.
          channelConnected={true}
          emptyHint="Once you publish a video, it'll show up here."
        />
      </section>
    </div>
  );
}

async function fetchPublishedVideos(token: string): Promise<Video[]> {
  const data = await serverFetch<{ videos: Video[] }>(
    token,
    "/api/videos/published",
  );
  return data.videos;
}