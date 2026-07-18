"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRetryVideo } from "@/hooks/use-videos";
import { extractFailedStep } from "@/lib/friendly-error";

interface RetryButtonProps {
  videoId: string;
  videoTitle?: string;
  /** Current video status — used to tailor the confirm prompt. */
  status: string;
  /** Raw failure reason string (optional), used to detect which step failed. */
  failureReason?: string | null;
  retryCount?: number;
}

const STEP_CONFIRM: Record<string, { label: string; confirm: string }> = {
  extraction: {
    label: "audio extraction",
    confirm: "re-run audio and frame extraction",
  },
  transcription: {
    label: "transcription",
    confirm: "re-run transcription (the audio is already on our servers)",
  },
  generation: {
    label: "chapter generation",
    confirm: "re-run chapter and thumbnail generation (the transcript is already saved)",
  },
  thumbnails: {
    label: "thumbnail generation",
    confirm: "re-run thumbnail generation (chapters are already done)",
  },
  publish: {
    label: "publishing",
    confirm: "re-publish to YouTube",
  },
};

export function RetryButton({ videoId, videoTitle, status, failureReason, retryCount }: RetryButtonProps) {
  const router = useRouter();
  const mutation = useRetryVideo();

  const isThumbnailRetry = status === "GENERATING";
  const failedStep = isThumbnailRetry
    ? "thumbnails"
    : extractFailedStep(failureReason);
  const stepInfo = STEP_CONFIRM[failedStep] ?? {
    label: "processing",
    confirm: "re-run the entire pipeline from the start",
  };

  const retryLabel =
    retryCount != null && retryCount > 0 ? `Retry ${stepInfo.label} (attempt ${retryCount + 1}/4)` : `Retry ${stepInfo.label}`;

  const handleClick = () => {
    const label = videoTitle ? `"${videoTitle}"` : "this video";
    if (!confirm(`Retry ${stepInfo.label} for ${label}? This will ${stepInfo.confirm}.`)) return;
    mutation.mutate(videoId, {
      onSuccess: () => {
        toast.success(`Retrying ${stepInfo.label} — you'll see progress update live.`);
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
        videoTitle
          ? `${retryLabel} for ${videoTitle}`
          : retryLabel
      }
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      )}
      {retryLabel}
    </Button>
  );
}
