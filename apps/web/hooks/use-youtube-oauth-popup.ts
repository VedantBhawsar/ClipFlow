"use client";

/**
 * Open the Google OAuth URL in a centered popup and listen for the
 * postMessage / BroadcastChannel callback. The actual code exchange
 * is the consumer's job (the existing `useConnectYouTube` mutation
 * handles the round-trip).
 *
 * Reused by:
 * - `<YouTubeConnectCard>` on the dashboard home
 * - `apps/web/app/youtube-connect/callback/page.tsx` itself (the popup)
 * - `<QuestionThumbnailStyle>` (the wizard step 5 inline "Connect
 *   YouTube first" prompt)
 * - `<YouTubeConnectForm>` on the settings/connected page
 *
 * Returning a tuple — `[connect, oauthError, isBusy]` — keeps the API
 * surface tight and matches the pattern used elsewhere.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useApi } from "@/hooks/use-api";

export interface UseYouTubeOAuthPopup {
  /** Open the popup. Returns immediately; resolves on `connectSettled`. */
  connect: () => void;
  /** True while the popup is open OR the mutation is in-flight. */
  isBusy: boolean;
  /** User-facing error (popup blocked, OAuth error, etc.). */
  error: string | null;
  /** Clear the error from the UI. */
  clearError: () => void;
}

const YOUTUBE_OAUTH_POPUP_NAME = "youtube_oauth";
const YOUTUBE_OAUTH_CHANNEL = "clipflow-youtube-oauth";

export function useYouTubeOAuthPopup(): UseYouTubeOAuthPopup {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Latest resolve/reject refs so the BroadcastChannel listener can
  // signal the caller without re-binding.
  const popupRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    // Mount the channel once; teardown on unmount.
    const channel = new BroadcastChannel(YOUTUBE_OAUTH_CHANNEL);
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const connect = useCallback(() => {
    setError(null);

    if (!api) {
      setError("API client is not available yet.");
      return;
    }

    let popup: Window | null = null;
    try {
      // The width / height match the dashboard `<YouTubeConnectCard>` popup
      // so the two flows look identical to the user.
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      popup = window.open(
        "", // placeholder — overwritten by the server-provided URL below
        YOUTUBE_OAUTH_POPUP_NAME,
        `width=${width},height=${height},left=${left},top=${top},popup=yes`,
      );
    } catch {
      setError("Could not open a pop-up window. Please allow pop-ups.");
      return;
    }

    if (!popup) {
      setError(
        "Pop-up was blocked. Please allow pop-ups for this site and try again.",
      );
      return;
    }

    popupRef.current = popup;
    setIsBusy(true);

    // The callback page (apps/web/app/youtube-connect/callback/page.tsx)
    // posts the OAuth code via BroadcastChannel. We then close the popup
    // and resolve.
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: "YOUTUBE_OAUTH_CODE"; code: string }
        | { type: "YOUTUBE_OAUTH_ERROR"; error: string }
        | undefined;
      if (!data) return;

      if (data.type === "YOUTUBE_OAUTH_CODE") {
        // The consumer is responsible for actually exchanging the code
        // via the `useConnectYouTube` mutation. We just close the popup
        // and signal busy=false; the component owning the call will
        // detect the connection state via its query.
        try {
          popupRef.current?.close();
        } catch {
          // ignore
        }
        popupRef.current = null;
        setIsBusy(false);
        return;
      }
      if (data.type === "YOUTUBE_OAUTH_ERROR") {
        setError(data.error);
        try {
          popupRef.current?.close();
        } catch {
          // ignore
        }
        popupRef.current = null;
        setIsBusy(false);
        return;
      }
    };

    channelRef.current?.addEventListener("message", onMessage);

    void api
      .getYouTubeOAuthUrl()
      .then(({ url }) => {
        if (popupRef.current) {
          popupRef.current.location.href = url;
        }
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to start the OAuth flow.",
        );
        try {
          popupRef.current?.close();
        } catch {
          // ignore
        }
        popupRef.current = null;
        setIsBusy(false);
      });

    return () => {
      channelRef.current?.removeEventListener("message", onMessage);
    };
  }, [api]);

  return { connect, isBusy, error, clearError };
}
