"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDeleteVideo } from "@/hooks/use-videos";

interface CancelButtonProps {
  videoId: string;
}

/**
 * Cancel action for the video detail page. Calls
 * `DELETE /api/videos/:id` (which the server rejects with 409 for
 * already-published rows). On success, refreshes the server component
 * — for a cancelled row the page will hit `notFound()` and bounce
 * the user back to the dashboard, which is the correct outcome.
 *
 * The mutation surfaces its own error to the user via the api-client
 * wrapper, so a 409 lands as a thrown Error with the server's
 * "Published videos can't be deleted from ClipFlow…" message.
 */
export function CancelButton({ videoId }: CancelButtonProps) {
  const router = useRouter();
  const mutation = useDeleteVideo();

  const handleClick = () => {
    if (!confirm("Cancel this video? The file will be removed.")) return;
    mutation.mutate(videoId, {
      onSuccess: () => router.refresh(),
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={mutation.isPending}
      className="text-[color:var(--ink-muted)] hover:text-[color:var(--status-error)]"
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      Cancel
    </Button>
  );
}
