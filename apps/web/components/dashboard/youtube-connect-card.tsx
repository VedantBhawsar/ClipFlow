"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Youtube, Check, AlertCircle, Loader2, Unlink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApi } from "@/hooks/use-api";
import { useConnectYouTube } from "@/hooks/use-connect-youtube";
import { useDisconnectYouTube } from "@/hooks/use-disconnect-youtube";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";

/**
 * Persistent channel-connection card. Per Design.md, channel-connection
 * health is "a persistent element, not buried in settings" — this card
 * sits at the top of the dashboard content area.
 *
 * Reads its own connection state from `useYouTubeConnection()` so it
 * stays in sync with the rest of the dashboard (sidebar, settings page)
 * without prop drilling. After connect/disconnect mutations update the
 * cache, this card re-renders automatically.
 *
 * OAuth flow:
 *  - Card opens the Google OAuth URL in a popup.
 *  - /youtube-connect/callback (after the user grants access) parses
 *    the `code`/`error` from the URL and broadcasts it on the
 *    `clipflow-youtube-oauth` BroadcastChannel.
 *  - This card listens on that channel and calls the mutation.
 *  BroadcastChannel is same-origin-only, so we don't need the
 *  origin check the previous postMessage implementation required —
 *  and the listener cleanup is automatic (close on unmount).
 */
export function YouTubeConnectCard({ className }: { className?: string }) {
  const api = useApi();
  const connectionQuery = useYouTubeConnection();
  const connectMutation = useConnectYouTube();
  const disconnectMutation = useDisconnectYouTube();

  // Local error for the OAuth popup flow itself (popup blocked, user
  // closed window without granting, etc). Mutation errors are surfaced
  // from the mutation state.
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Surface mutation errors that come from the API call itself (e.g.,
  // 400 from the OAuth code exchange). Reset whenever a new attempt
  // starts so the banner doesn't carry over from a previous run.
  const mutationError =
    connectMutation.error ?? disconnectMutation.error ?? null;
  const error =
    oauthError ??
    (mutationError instanceof Error
      ? mutationError.message
      : mutationError
        ? "Couldn't update your YouTube connection."
        : null);

  const isBusy = connectMutation.isPending || disconnectMutation.isPending;

  // Subscribe to the OAuth callback page's broadcast. Cleanup is just
  // closing the channel; the listener reference doesn't leak.
  useEffect(() => {
    const channel = new BroadcastChannel("clipflow-youtube-oauth");
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: "YOUTUBE_OAUTH_CODE"; code: string }
        | { type: "YOUTUBE_OAUTH_ERROR"; error: string }
        | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "YOUTUBE_OAUTH_CODE") {
        setOauthError(null);
        connectMutation.mutate(data.code);
      } else if (data.type === "YOUTUBE_OAUTH_ERROR") {
        setOauthError(data.error || "Google didn't grant access.");
      }
    };
    return () => {
      channel.close();
    };
    // connectMutation is stable for the component lifetime; depending
    // on it would re-subscribe on every mutation tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setOauthError(null);
    try {
      const { url } = await api.getYouTubeOAuthUrl();
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        url,
        "youtube_oauth",
        `width=${width},height=${height},left=${left},top=${top},popup=yes`,
      );
      if (!popup) {
        setOauthError(
          "Pop-up was blocked. Please allow pop-ups for this site and try again.",
        );
      }
    } catch (err) {
      setOauthError(
        err instanceof Error ? err.message : "Failed to initiate OAuth flow.",
      );
    }
  };

  const handleDisconnect = () => {
    if (
      !confirm("Disconnect your YouTube channel? You can reconnect anytime.")
    ) {
      return;
    }
    disconnectMutation.mutate();
  };

  const status = connectionQuery.data?.status ?? "disconnected";
  const channelTitle = connectionQuery.data?.channelTitle ?? null;
  const channelThumbnailUrl = connectionQuery.data?.channelThumbnailUrl ?? null;

  if (connectionQuery.isLoading) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-4">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
    );
  }

  if (status === "connected") {
    return (
      <Card
        className={cn(
          "border-[color:var(--status-ready)]/30 bg-[color:var(--status-ready)]/5",
          className,
        )}
      >
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          {channelThumbnailUrl ? (
            <Image
              src={channelThumbnailUrl}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--muted)]">
              <Youtube
                className="size-5 text-[color:var(--ink-muted)]"
                strokeWidth={1.75}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Check
                className="size-4 text-[color:var(--status-ready)]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <CardTitle className="text-sm font-medium">
                {channelTitle ?? "YouTube channel"} connected
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              You&apos;re ready to publish videos.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            disabled={isBusy}
            className="text-[color:var(--ink-muted)] hover:text-[color:var(--status-error)]"
          >
            {disconnectMutation.isPending ? (
              <Loader2
                className="size-4 animate-spin"
                strokeWidth={1.75}
              />
            ) : (
              <Unlink className="size-4" strokeWidth={1.75} />
            )}
            Disconnect
          </Button>
        </CardHeader>
      </Card>
    );
  }

  if (status === "needs_reauth") {
    return (
      <Card
        className={cn(
          "border-[color:var(--status-error)]/30 bg-[color:var(--status-error)]/5",
          className,
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[color:var(--status-error)]"
            />
            <div className="flex-1">
              <CardTitle className="text-base">
                Reconnect your YouTube channel
              </CardTitle>
              <CardDescription className="mt-1">
                Your channel connection has expired. Reconnect to continue
                publishing.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Button onClick={handleConnect} disabled={isBusy}>
            {isBusy ? (
              <Loader2
                className="size-4 animate-spin"
                strokeWidth={1.75}
              />
            ) : (
              <Youtube strokeWidth={1.75} aria-hidden="true" />
            )}
            Reconnect channel
          </Button>
          {error && (
            <p className="mt-2 flex items-center gap-1 text-xs text-[color:var(--status-error)]">
              <AlertCircle className="size-3" strokeWidth={1.75} />
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Disconnected state
  return (
    <Card
      className={cn(
        "border-[color:var(--status-processing)]/30 bg-[color:var(--status-processing)]/5",
        className,
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[color:var(--status-processing)]"
          />
          <div className="flex-1">
            <CardTitle className="text-base">
              Connect your YouTube channel
            </CardTitle>
            <CardDescription className="mt-1">
              ClipFlow can&apos;t publish until your channel is connected. It
              takes about a minute.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Button onClick={handleConnect} disabled={isBusy}>
          {isBusy ? (
            <Loader2
              className="size-4 animate-spin"
              strokeWidth={1.75}
            />
          ) : (
            <Youtube strokeWidth={1.75} aria-hidden="true" />
          )}
          Connect your channel
        </Button>
        {error && (
          <p className="mt-2 flex items-center gap-1 text-xs text-[color:var(--status-error)]">
            <AlertCircle className="size-3" strokeWidth={1.75} />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
