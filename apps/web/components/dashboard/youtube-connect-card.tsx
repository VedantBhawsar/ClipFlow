"use client";

import { useState } from "react";
import { Youtube, Check, AlertCircle, Loader2, Unlink } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface YouTubeConnectCardProps {
  /**
   * Connection status from the user bundle.
   */
  status?: "connected" | "needs_reauth" | "disconnected";
  /**
   * Channel title (shown when connected).
   */
  channelTitle?: string | null;
  /**
   * Channel thumbnail URL (shown when connected).
   */
  channelThumbnailUrl?: string | null;
  /**
   * Callback when the connection state changes (e.g., after connect/disconnect).
   * The parent should refresh the auth context or re-fetch the bundle.
   */
  onChange?: () => void;
  className?: string;
}

/**
 * Persistent channel-connection card. Per Design.md, channel-connection
 * health is "a persistent element, not buried in settings" — this card
 * sits at the top of the dashboard content area.
 *
 * When unconnected, it initiates the OAuth flow directly via a popup.
 * When connected, it shows the channel's basic info (thumbnail, title)
 * with a disconnect option.
 */
export function YouTubeConnectCard({
  status = "disconnected",
  channelTitle,
  channelThumbnailUrl,
  onChange,
  className,
}: YouTubeConnectCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get the OAuth URL from our backend
      const { url } = await api.getYouTubeOAuthUrl();

      // Open Google OAuth in a popup
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
        throw new Error(
          "Pop-up was blocked. Please allow pop-ups for this site and try again.",
        );
      }

      // Listen for the authorization code via postMessage
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (!event.data?.type === "YOUTUBE_OAUTH_CODE") return;

        window.removeEventListener("message", handleMessage);
        popup.close();

        try {
          await api.connectYouTube(event.data.code);
          onChange?.();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to connect channel.");
          setLoading(false);
        }
      };

      window.addEventListener("message", handleMessage);

      // Fallback: check if popup was closed without completing
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed);
          window.removeEventListener("message", handleMessage);
          // If we didn't get a code, just reset loading state
          setLoading(false);
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate OAuth flow.");
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your YouTube channel? You can reconnect anytime.")) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.disconnectYouTube();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect channel.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "connected") {
    return (
      <Card className={cn("border-status-ready/30 bg-status-ready/5", className)}>
        <CardContent className="flex items-center gap-4 p-4">
          {channelThumbnailUrl ? (
            <img
              src={channelThumbnailUrl}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Youtube className="h-6 w-6 text-red-600" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-status-ready" />
              <span className="text-sm font-medium text-foreground">
                {channelTitle ?? "YouTube channel"} connected
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              You&apos;re ready to publish videos.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            disabled={loading}
            className="text-muted-foreground hover:text-destructive"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="h-4 w-4" />
            )}
            Disconnect
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "needs_reauth") {
    return (
      <Card className={cn("border-amber-500/30 bg-amber-500/5", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500"
            />
            <div className="flex-1">
              <CardTitle className="text-base">Reconnect your YouTube channel</CardTitle>
              <CardDescription className="mt-1">
                Your channel connection has expired. Reconnect to continue publishing.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Button onClick={handleConnect} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Youtube aria-hidden="true" />
            )}
            Reconnect channel
          </Button>
          {error && (
            <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Disconnected state
  return (
    <Card className={cn("border-amber-500/30 bg-amber-500/5", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500"
          />
          <div className="flex-1">
            <CardTitle className="text-base">Connect your YouTube channel</CardTitle>
            <CardDescription className="mt-1">
              ClipFlow can&apos;t publish until your channel is connected.
              It takes about a minute.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Button onClick={handleConnect} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Youtube aria-hidden="true" />
          )}
          Connect your channel
        </Button>
        {error && (
          <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
