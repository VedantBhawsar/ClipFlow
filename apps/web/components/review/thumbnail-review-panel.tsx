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
  // Local mirror of the server's `selectedThumbnailId`. Seeded
  // from the SSR-provided value so the first paint shows the
  // correct selection; the server is still the source of truth
  // and overrides local state on every refetch.
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialSelectedId,
  );

  // Keep local state in sync if the server-side value changes
  // (e.g. another tab picks a thumbnail, or the SSE-driven
  // refetch lands a fresher value). We only follow the server
  // when the two are out of sync, so a fast in-flight optimistic
  // update isn't clobbered by a slow refetch.
  React.useEffect(() => {
    setSelectedId((prev) => (prev === initialSelectedId ? prev : initialSelectedId));
  }, [initialSelectedId]);

  const selectMutation = useSelectThumbnail();
  const regenerateMutation = useRegenerateThumbnails();

  const handleSelect = React.useCallback(
    (id: string) => {
      if (disabled) return;
      if (id === selectedId) return; // no-op tap
      const previousId = selectedId;
      setSelectedId(id); // optimistic
      selectMutation.mutate(
        { videoId, thumbnailId: id },
        {
          onError: (err) => {
            // Revert on failure so the green border returns to
            // whatever the server last acknowledged.
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
    regenerateMutation.mutate(
      { videoId },
      {
        onSuccess: () => {
          toast.success(
            "Generating fresh options. We'll refresh the grid when they're ready.",
          );
        },
        onError: (err) => {
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
      disabled={disabled}
    />
  );
}
