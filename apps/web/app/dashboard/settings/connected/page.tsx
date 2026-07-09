"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import Link from "next/link";

import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { YouTubeConnectCard } from "@/components/dashboard/youtube-connect-card";
import { QuestionThumbnailStyle } from "@/components/onboarding/question-thumbnail-style";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";
import { useSettings } from "@/hooks/use-settings";

export default function ConnectedSettingsPage() {
  const connectionQuery = useYouTubeConnection();
  const settingsQuery = useSettings();
  const [open, setOpen] = React.useState(false);

  const isConnected = connectionQuery.data?.status === "connected";
  const thumbnailStyle = settingsQuery.data?.channelThumbnailStyle;
  const hasStyle = thumbnailStyle !== null && thumbnailStyle !== undefined;

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
        {connectionQuery.error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {connectionQuery.error instanceof Error
              ? connectionQuery.error.message
              : "Couldn't load your YouTube connection."}
          </p>
        ) : connectionQuery.isPending || !connectionQuery.data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <YouTubeConnectCard />
        )}
      </section>

      {isConnected ? (
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
              <dd className="font-medium">
                {connectionQuery.data?.channelTitle ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last verified</dt>
              <dd className="font-medium">
                {formatDateTime(connectionQuery.data?.lastVerifiedAt)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {isConnected ? (
        <section
          aria-labelledby="thumbnail-style"
          className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm"
        >
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <h2
              id="thumbnail-style"
              className="text-sm font-semibold text-foreground"
            >
              Personalize thumbnails
            </h2>
          </div>
          {hasStyle ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                We use the style we learned from your channel for every new
                thumbnail. Refresh whenever you rebrand.
              </p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Last analyzed
                  </dt>
                  <dd className="font-medium">
                    {formatDateTime(thumbnailStyle.lastAnalyzedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Confidence
                  </dt>
                  <dd className="font-medium">
                    {thumbnailStyle.confidence === "HIGH"
                      ? "High"
                      : "Low — falling back to niche defaults"}
                  </dd>
                </div>
              </dl>
              <div>
                <Button
                  type="button"
                  onClick={() => setOpen(true)}
                  data-testid="refresh-thumbnail-style"
                >
                  Refresh my channel style
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pick 1–4 of your recent thumbnails and we&apos;ll learn your
                visual style so generated thumbnails match your channel.
              </p>
              <div>
                <Button asChild>
                  <Link
                    href="/dashboard/thumbnail-style"
                    data-testid="setup-thumbnail-style"
                  >
                    Set up personalized thumbnails
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Refresh your channel style</DialogTitle>
            <DialogDescription>
              Pick 1–4 thumbnails that best represent your style. We&apos;ll
              re-analyze them and update the style used for new thumbnails.
            </DialogDescription>
          </DialogHeader>
          <QuestionThumbnailStyle
            variant="settings"
            onComplete={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
