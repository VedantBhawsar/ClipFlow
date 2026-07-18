"use client";

import { useEffect } from "react";
import { useVideoSSE } from "@/hooks/use-video-sse";
import { cn } from "@/lib/utils";

interface VideoDetailLiveProgressProps {
  videoId: string;
}

/**
 * Ambient real-time progress strip for the detail page. Per Design.md
 * Section 5 (motion is off by default; no loading spinners where the
 * status timeline can indicate in-progress instead), this component
 * carries text-only status and progress information — no spinner, no
 * animated progress bar. The pulsing segment on the parent's
 * `<StatusTimeline>` is the shared indicator of "something is
 * happening".
 */
export function VideoDetailLiveProgress({
  videoId,
}: VideoDetailLiveProgressProps) {
  const { events, connected, error } = useVideoSSE(videoId);
  const latest = events.at(-1);

  useEffect(() => {
    if (latest && latest.type !== "PROGRESS") {
      // Trigger re-fetch of video data for any meaningful event
      window.dispatchEvent(
        new CustomEvent("video-status-changed", {
          detail: { videoId },
        }),
      );
    }
  }, [latest, videoId]);

  if (!latest && !connected) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[color:var(--ink-muted)]">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            connected
              ? "bg-[color:var(--status-ready)]"
              : "bg-[color:var(--ink-muted)]/40",
          )}
          aria-hidden="true"
        />
        <span>{connected ? "Live" : "Reconnecting"}</span>
      </span>

      {latest?.type === "PROGRESS" ? (
        <span className="font-mono tabular-nums">
          {latest.stage} · {latest.progress}%
        </span>
      ) : null}

      {latest?.type === "STATUS_UPDATE" ? (
        <span>Stage: {latest.status}</span>
      ) : null}

      {error ? (
        <span className="text-[color:var(--status-error)]">{error}</span>
      ) : null}

      {latest?.type === "ERROR" ? (
        <span className="text-[color:var(--status-error)]">{latest.error}</span>
      ) : null}
    </div>
  );
}
