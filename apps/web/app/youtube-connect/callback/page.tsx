"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = searchParams.get("code");
  const error = searchParams.get("error");

  useEffect(() => {
    if (typeof window === "undefined" || !window.opener) {
      router.replace("/dashboard");
      return;
    }

    const channel = new BroadcastChannel("clipflow-youtube-oauth");

    if (code) {
      channel.postMessage({
        type: "YOUTUBE_OAUTH_CODE",
        code,
      });
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
          <p>Connecting your channel...</p>
        ) : error ? (
          <p>Authorization failed: {decodeURIComponent(error)}</p>
        ) : (
          <p>Processing...</p>
        )}
      </div>
    </div>
  );
}

export default function YouTubeCallbackPage() {
  return (
    <Suspense fallback={<div>Processing...</div>}>
      <CallbackContent />
    </Suspense>
  );
}