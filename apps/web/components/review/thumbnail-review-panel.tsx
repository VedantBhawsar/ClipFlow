/**
 * Client-side wrapper around `<ThumbnailReview>` that owns the
 * selection state and wires the action buttons to the thumbnail
 * mutations.
 *
 * Why a wrapper and not inlining the state into the existing
 * `<ThumbnailReview>`:
 *   - The detail page is a server component (RSC) that re-renders on
 *     data refetch; if selection state lived there, the user would
 *     see the "click → blink back to previous selection" round-trip
 *     every time the page re-renders.
 *   - Putting the state in a `"use client"` component lets the
 *     server re-render freely (status updates, SSE refetch) while
 *     the local "what does the user currently have selected" state
 *     stays in one place and is never clobbered by a server round
 *     trip.
 *
 * The wrapper is intentionally thin — it doesn't add a new visual
 * layer. The existing `<ThumbnailReview>` renders the same grid; the
 * panel just plumbs the click + regenerate handlers into the right
 * hooks.
 *
 * Optimistic update pattern: when the user clicks a tile, we update
 * local `selectedId` immediately so the green border moves with no
 * perceptible delay, and fire the mutation in the background. On
 * mutation error we revert to `initialSelectedId` and toast the
 * error. On success the cache invalidation in the hook re-pulls the
 * detail DTO so the rest of the page (publish button caption,
 * etc.) catches up.
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  useRegenerateThumbnails,
  useSelectThumbnail,
} from "@/hooks/use-videos";
import { ThumbnailReview } from "./thumbnail-review";
import type { ThumbnailOption } from "./thumbnail-card";

interface ThumbnailReviewPanelProps {
  videoId: string;
  options: ThumbnailOption[];
  /** The video's `selectedThumbnailId` from the server, used to
   *  seed the local selection state. */
  initialSelectedId: string | null;
  /** How many of the user's regen budget has been spent (5 in v1
   *  until tier data lands in the DB). */
  regenerationsUsed: number;
  regenerationsAllowed: number;
  /** Disable both select and regenerate. Driven by status —
   *  only `READY_FOR_REVIEW` and `PUBLISH_FAILED` are interactive. */
  disabled?: boolean;
}

export function ThumbnailReviewPanel({
  videoId,
  options,
  initialSelectedId,
  regenerationsUsed,
  regenerationsAllowed,
  disabled = false,
}: ThumbnailReviewPanelProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSelectedId,
  );
  const [isRegenerating, setIsRegenerating] = React.useState(false);

  // Keep local state in sync if the server-side value changes
  React.useEffect(() => {
    setSelectedId((prev) => (prev === initialSelectedId ? prev : initialSelectedId));
  }, [initialSelectedId]);

  // Clear regenerating state when options change (new thumbnails
  // arrived via SSE-driven refetch). Compare serialized ids so we
  // don't reset on every render — only when the set of tiles changes.
  const optionsKey = React.useMemo(
    () => options.map((o) => o.id).join(","),
    [options],
  );
  React.useEffect(() => {
    if (isRegenerating) {
      setIsRegenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  const selectMutation = useSelectThumbnail();
  const regenerateMutation = useRegenerateThumbnails();

  const handleSelect = React.useCallback(
    (id: string) => {
      if (disabled) return;
      if (id === selectedId) return;
      const previousId = selectedId;
      setSelectedId(id);
      selectMutation.mutate(
        { videoId, thumbnailId: id },
        {
          onError: (err) => {
            setSelectedId(previousId);
            toast.error(
              err.message || "Couldn't save that thumbnail. Try again.",
            );
          },
        },
      );
    },
    [disabled, selectedId, selectMutation, videoId],
  );

  const handleRegenerate = React.useCallback(() => {
    if (disabled) return;
    setIsRegenerating(true);
    regenerateMutation.mutate(
      { videoId },
      {
        onError: (err) => {
          setIsRegenerating(false);
          toast.error(
            err.message || "Couldn't start a new generation. Try again.",
          );
        },
      },
    );
  }, [disabled, regenerateMutation, videoId]);

  return (
    <ThumbnailReview
      options={options}
      selectedId={selectedId}
      onSelect={handleSelect}
      onRegenerate={handleRegenerate}
      regenerationsUsed={regenerationsUsed}
      regenerationsAllowed={regenerationsAllowed}
      disabled={disabled || regenerateMutation.isPending}
      regenerating={isRegenerating}
    />
  );
}
