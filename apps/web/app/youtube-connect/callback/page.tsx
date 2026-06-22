"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * OAuth callback page for the YouTube connect popup.
 *
 * This page is loaded as a redirect target from Google's OAuth flow.
 * It extracts the authorization code from the URL and sends it to the
 * opener window via postMessage, then closes the popup.
 *
 * The opener (YouTubeConnectCard) is listening for the message and
 * will exchange the code for a real connection via POST /api/youtube/connect.
 */
export default function YouTubeCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  useEffect(() => {
    if (window.opener) {
      if (code) {
        window.opener.postMessage({ type: "YOUTUBE_OAUTH_CODE", code }, window.location.origin);
      } else if (error) {
        window.opener.postMessage(
          { type: "YOUTUBE_OAUTH_ERROR", error: decodeURIComponent(error) },
          window.location.origin,
        );
      }
      // Close the popup
      window.close();
    } else {
      // Not in a popup - redirect to dashboard
      router.replace("/dashboard");
    }
  }, [code, error, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        {code ? (
          <>
            <p className="text-sm text-muted-foreground">Connecting your channel...</p>
          </>
        ) : error ? (
          <>
            <p className="text-sm text-destructive">Authorization failed: {decodeURIComponent(error)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              You can close this window and try again.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Processing...</p>
          </>
        )}
      </div>
    </div>
  );
}
