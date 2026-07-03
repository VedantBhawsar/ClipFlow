"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import type { Video } from "@clipflow/types";
import { Button } from "@/components/ui/button";
import { VideoDetailsDialog } from "@/components/dashboard/video-details-dialog";

interface EditDetailsButtonProps {
  video: Pick<
    Video,
    | "id"
    | "title"
    | "description"
    | "tags"
    | "privacyStatus"
    | "madeForKids"
    | "embeddable"
    | "license"
    | "publicStatsViewable"
    | "commentPolicy"
  >;
}

/**
 * Thin client island that keeps the Sheet open-state and renders the
 * "Edit details" trigger. Kept separate from the RSC page so the
 * server component can export `metadata` while the button stays
 * client-side.
 */
export function EditDetailsButton({ video }: EditDetailsButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Edit details
      </Button>

      <VideoDetailsDialog
        open={open}
        onOpenChange={setOpen}
        video={video}
      />
    </>
  );
}