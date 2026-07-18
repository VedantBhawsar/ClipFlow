import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { Video, YouTubeConnection } from "@clipflow/types";

import { auth } from "@/auth";
import { serverFetch, ServerApiError } from "@/lib/api-client";
import { VideoDetailContent } from "@/app/dashboard/published/[id]/video-detail-content";

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
 * round-trip for the initial read). Hands initial data off to the
 * `VideoDetailContent` client component which uses TanStack Query +
 * SSE-driven cache invalidation for reactive updates.
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
    video = await serverFetch<Video>(token, `/api/videos/${id}`);
    const connection = await serverFetch<YouTubeConnection>(
      token,
      "/api/youtube/connection",
    ).catch(() => null);
    channelConnected = connection?.status === "connected";
  } catch (err) {
    if (err instanceof ServerApiError && err.status === 404) {
      notFound();
    }
    video = null;
  }

  if (!video) {
    notFound();
  }

  return (
    <VideoDetailContent
      videoId={id}
      initialVideo={video}
      channelConnected={channelConnected}
    />
  );
}
