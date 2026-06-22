"use client";

import Link from "next/link";
import { Upload, Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /**
   * Whether the user has connected a YouTube channel. When `false`,
   * the empty state shows the "connect your channel first" prompt
   * — the upload CTA is gated behind a connected channel per
   * AppFlow.md.
   */
  connected?: boolean;
}

/**
 * "No videos yet" empty state. Per Design.md the dashboard empty
 * state is text-first: no decorative illustration, no apology,
 * one invitation and one action.
 *
 * The Upload button is enabled once a YouTube channel is connected.
 * When the channel isn't connected yet, the empty state points the
 * user at the prerequisite rather than teasing a feature they can't
 * act on.
 */
export function EmptyState({ connected = false }: EmptyStateProps) {
  if (!connected) {
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
            Connect your channel to get started
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            ClipFlow can&apos;t publish until your YouTube channel is
            connected. It takes about a minute, and you stay in control of
            every video.
          </p>
          <Button asChild className="mt-2">
            <Link href="/youtube-connect">
              <Youtube aria-hidden="true" />
              Connect your channel
            </Link>
          </Button>
        </div>
      </section>
    );
  }

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
          disabled
          aria-disabled="true"
          className="mt-2"
          title="Upload ships with the next slice"
        >
          <Upload aria-hidden="true" />
          Upload your first video
        </Button>
        <p className="text-xs text-muted-foreground">
          Upload ships with the next slice. Use Settings to get your
          account ready in the meantime.
        </p>
      </div>
    </section>
  );
}
