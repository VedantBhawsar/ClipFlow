"use client";

import * as React from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PublishSheet, type PublishVideoSheetVideo } from "@/components/dashboard/publish-sheet";

interface PublishButtonProps {
  video: PublishVideoSheetVideo;
}

/**
 * Header "Publish" button for a `READY_FOR_REVIEW` (or
 * `PUBLISH_FAILED` retry) video. Opens the dedicated `PublishSheet`
 * which handles the publish-now / schedule split.
 *
 * Kept separate from the RSC page so the page can still export
 * `metadata` (server component boundary).
 */
export function PublishButton({ video }: PublishButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="publish-button"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        Publish
      </Button>

      <PublishSheet open={open} onOpenChange={setOpen} video={video} />
    </>
  );
}
