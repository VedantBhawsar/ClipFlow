"use client";

import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "Upload your first video" empty state. Per Design.md the dashboard
 * empty state is text-first: no decorative illustration, no apology,
 * one invitation and one action.
 *
 * The Upload button is rendered but disabled-looking — uploads require
 * a connected YouTube channel (the dashboard's connect card handles
 * that), and we don't want to surface an Upload affordance the user
 * can't act on yet. The helper line points them at the prerequisite.
 */
export function EmptyState() {
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
          title="Connecting your YouTube channel is the first step"
        >
          <Upload aria-hidden="true" />
          Upload your first video
        </Button>
        <p className="text-xs text-muted-foreground">
          Connecting your YouTube channel is the first step.
        </p>
      </div>
    </section>
  );
}
