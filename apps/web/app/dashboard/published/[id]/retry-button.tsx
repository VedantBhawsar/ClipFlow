"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRetryVideo } from "@/hooks/use-videos";

interface RetryButtonProps {
  videoId: string;
  /** Title used in the confirm prompt and the aria-label. */
  videoTitle?: string;
}

/**
 * Retry action for the video detail page. Visible only on FAILED rows
 * (the `<ActionPanel>` in `page.tsx` gates the render).
 *
 * Calls `POST /api/videos/:id/retry` which resets the row to
 * `EXTRACTING` and re-enqueues the ingest job. We `router.refresh()`
 * after the mutation so the page re-renders with the new status pill
 * + the live SSE progress strip.
 *
 * A confirm prompt asks the user before kicking it off — retrying
 * re-runs FFmpeg and the LLM stages, which costs the user's plan
 * quota for thumbnails + LLM tokens. The prompt is the cheap "are
 * you sure" gate; the server-side guard (status === "FAILED") is the
 * real safety.
 */
export function RetryButton({ videoId, videoTitle }: RetryButtonProps) {
  const router = useRouter();
  const mutation = useRetryVideo();

  const handleClick = () => {
    const label = videoTitle ? `"${videoTitle}"` : "this video";
    if (!confirm(`Retry processing for ${label}? This will re-run the pipeline from the start.`)) return;
    mutation.mutate(videoId, {
      onSuccess: () => {
        toast.success("Retrying — back to the start of the pipeline.");
        router.refresh();
      },
      onError: (err) => {
        toast.error(err.message || "Couldn't retry. Try again in a moment.");
      },
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={mutation.isPending}
      aria-label={
        videoTitle ? `Retry processing for ${videoTitle}` : "Retry processing"
      }
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      )}
      Retry
    </Button>
  );
}
