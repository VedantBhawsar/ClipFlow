"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUnpublishVideo } from "@/hooks/use-videos";

interface UnpublishButtonProps {
  videoId: string;
}

/**
 * Unpublish action for the video detail page. Calls
 * `POST /api/videos/:id/unpublish` (which flips the YouTube
 * privacyStatus to private and mirrors it on the row) and refreshes
 * the server component so the page re-renders with the new state.
 *
 * Confirmation is handled by the standard `confirm()` so we don't
 * pull in a dialog for a single yes/no — the unpublish is reversible
 * (re-publish from YouTube Studio) but still destructive enough to
 * deserve an explicit ack.
 */
export function UnpublishButton({ videoId }: UnpublishButtonProps) {
  const router = useRouter();
  const mutation = useUnpublishVideo();

  const handleClick = () => {
    if (
      !confirm(
        "Unpublish this video on YouTube? It will be set back to private.",
      )
    ) {
      return;
    }
    mutation.mutate(videoId, {
      onSuccess: () => router.refresh(),
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      Unpublish
    </Button>
  );
}
