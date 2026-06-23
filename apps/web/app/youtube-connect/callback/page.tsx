"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * OAuth callback page for the YouTube connect popup.
 *
 * This page is loaded as a redirect target from Google's OAuth flow.
 * It extracts the authorization code from the URL and broadcasts it
 * on the `clipflow-youtube-oauth` BroadcastChannel, which the
 * <YouTubeConnectCard> opened earlier is listening on. The card then
 * exchanges the code for a real connection via POST /api/youtube/connect.
 *
 * BroadcastChannel is same-origin only, so it replaces the previous
 * postMessage + origin check dance (and the operator-precedence bug
 * that came with it). If the page wasn't opened in a popup, we just
 * send the user back to the dashboard.
 */
export default function YouTubeCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  useEffect(() => {
    // Detect popup vs full-page navigation by checking for window.opener.
    // If there's no opener, this page was navigated to directly (e.g.
    // from a link) — just route to /dashboard and skip the broadcast.
    if (typeof window === "undefined" || !window.opener) {
      router.replace("/dashboard");
      return;
    }

    const channel = new BroadcastChannel("clipflow-youtube-oauth");
    if (code) {
      channel.postMessage({ type: "YOUTUBE_OAUTH_CODE", code });
    } else if (error) {
      channel.postMessage({
        type: "YOUTUBE_OAUTH_ERROR",
        error: decodeURIComponent(error),
      });
    }
    channel.close();
    window.close();
  }, [code, error, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        {code ? (
          <p className="text-sm text-muted-foreground">Connecting your channel...</p>
        ) : error ? (
          <>
            <p className="text-sm text-destructive">Authorization failed: {decodeURIComponent(error)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              You can close this window and try again.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Processing...</p>
        )}
      </div>
    </div>
  );
}
