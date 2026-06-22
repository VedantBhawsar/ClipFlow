"use client";

import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /**
   * Whether the user has connected a YouTube channel. When `false`,
   * the upload CTA is gated behind a connected channel — the
   * YouTubeConnectCard above handles prompting the user to connect.
   */
  connected?: boolean;
}

/**
 * "No videos yet" empty state. Per Design.md the dashboard empty
 * state is text-first: no decorative illustration, no apology,
 * one invitation and one action.
 *
 * The Upload button is enabled once a YouTube channel is connected.
 * When the channel isn't connected yet, the YouTubeConnectCard
 * (shown above this component) handles prompting the user to connect.
 */
export function EmptyState({ connected = false }: EmptyStateProps) {
  return (
    <section
      aria-labelledby="videos-empty-title"
      className="rounded-xl border border-dashed border-border bg-card/40 p-8 sm:p-12"
    >
      <div className="flex flex-col items-start gap-3">
        <h2
          id="videos-empty-title"
          className="text-lg font-semibold tracking-tight"
        >
          No videos yet
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Upload a finished video and ClipFlow handles transcription,
          thumbnail generation, chapter detection, and scheduling. Your
          first one&apos;s the slowest — after that the workflow just runs.
        </p>
        <Button
          type="button"
          disabled={!connected}
          aria-disabled={!connected}
          className="mt-2"
          title={connected ? "Upload ships with the next slice" : "Connect your YouTube channel first"}
        >
          <Upload aria-hidden="true" />
          Upload your first video
        </Button>
        <p className="text-xs text-muted-foreground">
          {connected
            ? "Upload ships with the next slice. Use Settings to get your account ready in the meantime."
            : "Connect your YouTube channel above to get started."}
        </p>
      </div>
    </section>
  );
}
