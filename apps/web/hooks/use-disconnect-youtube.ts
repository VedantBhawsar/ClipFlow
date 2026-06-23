"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { UserBundleResponse, YouTubeConnection } from "@clipflow/types";

const DISCONNECTED_YT: YouTubeConnection = {
  status: "disconnected",
  channelId: null,
  channelTitle: null,
  channelThumbnailUrl: null,
  connectedAt: null,
  lastVerifiedAt: null,
};

/**
 * Disconnect the authenticated user's YouTube channel. Optimistic: we
 * flip the cached bundle to the "disconnected" shape immediately so the
 * sidebar stops showing the channel as connected, then invalidate to
 * reconcile from the server in case the disconnect actually failed.
 *
 * onError rolls back the snapshot; onSettled always invalidates so the
 * server-of-record wins on disagreement.
 */
export function useDisconnectYouTube() {
  const qc = useQueryClient();
  return useMutation<void, Error, void, { previous: UserBundleResponse | undefined }>({
    mutationFn: () => api.disconnectYouTube(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.user.bundle() });
      const previous = qc.getQueryData<UserBundleResponse>(
        queryKeys.user.bundle(),
      );
      if (previous) {
        qc.setQueryData<UserBundleResponse>(queryKeys.user.bundle(), {
          ...previous,
          youtubeConnection: DISCONNECTED_YT,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(queryKeys.user.bundle(), ctx.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.user.bundle() });
    },
  });
}
