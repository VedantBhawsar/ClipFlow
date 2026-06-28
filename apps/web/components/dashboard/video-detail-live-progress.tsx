"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useVideoSSE } from "@/hooks/use-video-sse";
import { cn } from "@/lib/utils";

interface VideoDetailLiveProgressProps {
  videoId: string;
}

export function VideoDetailLiveProgress({
  videoId,
}: VideoDetailLiveProgressProps) {
  const { events, connected, error } = useVideoSSE(videoId);
  const latest = events.at(-1);

  useEffect(() => {
    if (latest?.type === "STATUS_UPDATE") {
      // Trigger re-fetch of video data
      const evt = new CustomEvent("video-status-changed", {
        detail: { videoId, status: latest.status },
      });
      window.dispatchEvent(evt);
    }
  }, [latest, videoId]);

  if (!latest && connected) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        Connected
      </div>
    );
  }

  if (!latest) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          Live Progress
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs",
            connected ? "text-green-600" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              connected ? "bg-green-500" : "bg-gray-300",
            )}
          />
          {connected ? "Live" : "Disconnected"}
        </span>
      </div>

      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}

      {latest.type === "STATUS_UPDATE" && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-foreground">
            Status: <span className="font-medium">{latest.status}</span>
          </span>
        </div>
      )}

      {latest.type === "PROGRESS" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground">{latest.stage}</span>
            <span className="text-muted-foreground">
              {latest.progress}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${latest.progress}%` }}
            />
          </div>
        </div>
      )}

      {latest.type === "ERROR" && (
        <p className="text-xs text-destructive">
          Error: {latest.error}
        </p>
      )}
    </div>
  );
}
