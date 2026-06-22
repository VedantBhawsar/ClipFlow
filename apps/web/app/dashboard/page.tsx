import type { Metadata } from "next";

import { YouTubeConnectCard } from "@/components/dashboard/youtube-connect-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatusTimeline } from "@/components/dashboard/status-timeline";

export const metadata: Metadata = {
  title: "Dashboard — ClipFlow",
  description: "Your publishing pipeline at a glance.",
};

/**
 * Dashboard home.
 *
 * v1 states (per AppFlow.md Section 9 + Design.md Section 3):
 * - Channel-connection card sits at the top of the content area until
 *   the user connects YouTube. This is the "persistent" connection
 *   health indicator — not buried in settings.
 * - Video list area below shows the empty state until the first upload.
 *   The disabled-looking Upload button + helper line point users at
 *   the prerequisite (connecting their channel) rather than teasing
 *   a feature they can't act on yet.
 *
 * Note on the status timeline: it's shown here as a one-line preview
 * so even the empty-state path communicates "this is where your
 * videos will live." The first real row will replace this preview.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Your publishing pipeline, one glance.
        </p>
      </header>

      <YouTubeConnectCard state="unconnected" />

      <section aria-labelledby="videos-heading" className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 id="videos-heading" className="text-sm font-semibold text-foreground">
            Videos
          </h2>
        </div>

        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <StatusTimeline status="uploaded" />
        </div>

        <EmptyState />
      </section>
    </div>
  );
}
