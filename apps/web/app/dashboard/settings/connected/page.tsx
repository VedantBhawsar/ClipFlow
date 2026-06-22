"use client";

import * as React from "react";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { YouTubeConnectCard } from "@/components/dashboard/youtube-connect-card";
import { formatDateTime } from "@/lib/format";
import { api } from "@/lib/api-client";
import type { YouTubeConnection } from "@clipflow/types";

export default function ConnectedSettingsPage() {
  const [connection, setConnection] = React.useState<YouTubeConnection | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .getYouTubeConnection()
      .then((c) => {
        if (!cancelled) setConnection(c);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Couldn't load your YouTube connection.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="YouTube connection"
        description="ClipFlow publishes to YouTube on your behalf. The connection state is always visible from the dashboard sidebar — this page is the place to reconnect when the refresh token expires."
      />

      <section
        aria-labelledby="connection-status"
        className="space-y-3"
      >
        <h2
          id="connection-status"
          className="text-sm font-semibold text-foreground"
        >
          Current status
        </h2>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : connection === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <YouTubeConnectCard
            state={connection.status === "connected" ? "connected" : "unconnected"}
          />
        )}
      </section>

      {connection?.status === "connected" ? (
        <section
          aria-labelledby="connection-details"
          className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm"
        >
          <h2
            id="connection-details"
            className="text-sm font-semibold text-foreground"
          >
            Details
          </h2>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Channel</dt>
              <dd className="font-medium">{connection.channelTitle ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last verified</dt>
              <dd className="font-medium">
                {formatDateTime(connection.lastVerifiedAt)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
