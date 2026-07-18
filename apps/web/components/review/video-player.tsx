"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ArtPlayer from "artplayer";
import { Loader2 } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import type { ChaptersJson } from "@clipflow/types";

interface VideoPlayerProps {
  videoId: string;
  chaptersJson: ChaptersJson | null;
  className?: string;
  onReady?: (art: ArtPlayer) => void;
  onTimeUpdate?: (currentTime: number) => void;
}

export function VideoPlayer({
  videoId,
  chaptersJson,
  className,
  onReady,
  onTimeUpdate,
}: VideoPlayerProps) {
  const api = useApi();
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<ArtPlayer | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await api!.getPlaybackUrl(videoId);
      setPlaybackUrl(url);
    } catch {
      setError("Failed to load video. Try again.");
    } finally {
      setLoading(false);
    }
  }, [api, videoId]);

  useEffect(() => {
    if (!api) return;
    fetchUrl();
  }, [api, fetchUrl]);

  useEffect(() => {
    if (!playbackUrl || !containerRef.current) return;

    const highlights = (chaptersJson?.chapters ?? []).map((ch) => ({
      time: ch.startMs / 1000,
      text: ch.title,
    }));

    const art = new ArtPlayer({
      container: containerRef.current,
      url: playbackUrl,
      autoSize: false,
      theme: "#eab308",
      volume: 0.5,
      isLive: false,
      muted: false,
      autoplay: false,
      autoMini: false,
      screenshot: true,
      setting: true,
      pip: true,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: false,
      miniProgressBar: false,
      mutex: true,
      backdrop: true,
      hotkey: true,
      playsInline: true,
      highlight: highlights,
    });

    artRef.current = art;

    art.on("ready", () => {
      onReady?.(art);
    });

    art.on("video:timeupdate", () => {
      onTimeUpdate?.(art.currentTime);
    });

    return () => {
      art.destroy(false);
      artRef.current = null;
    };
  }, [playbackUrl, chaptersJson, onReady, onTimeUpdate]);

  if (!api || loading) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg bg-muted">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={fetchUrl}
          className="text-xs font-medium text-primary underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full aspect-video overflow-hidden rounded-lg bg-black",
        className,
      )}
    />
  );
}
