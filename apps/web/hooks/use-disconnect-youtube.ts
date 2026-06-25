"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import type { YouTubeConnection } from "@clipflow/types";

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
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    void,
    {
      previousBundle: { youtubeConnection: YouTubeConnection } | undefined;
      previousConnection: YouTubeConnection | undefined;
    }
  >({
    mutationFn: () => api.disconnectYouTube(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.settings.bundle() });
      await qc.cancelQueries({ queryKey: queryKeys.settings.youtubeConnection() });

      const bundle = qc.getQueryData<{ youtubeConnection: YouTubeConnection }>(
        queryKeys.settings.bundle(),
      );
      const connection = qc.getQueryData<YouTubeConnection>(
        queryKeys.settings.youtubeConnection(),
      );

      const previousBundle = bundle ? { youtubeConnection: bundle.youtubeConnection } : undefined;
      const previousConnection = connection;

      if (bundle) {
        qc.setQueryData(queryKeys.settings.bundle(), {
          ...bundle,
          youtubeConnection: DISCONNECTED_YT,
        });
      }
      qc.setQueryData(queryKeys.settings.youtubeConnection(), DISCONNECTED_YT);

      return { previousBundle, previousConnection };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousBundle) {
        qc.setQueryData(queryKeys.settings.bundle(), (old) =>
          old
            ? { ...old, youtubeConnection: ctx.previousBundle!.youtubeConnection }
            : old,
        );
      }
      if (ctx?.previousConnection !== undefined) {
        qc.setQueryData(queryKeys.settings.youtubeConnection(), ctx.previousConnection);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.settings.bundle() });
      void qc.invalidateQueries({ queryKey: queryKeys.settings.youtubeConnection() });
    },
  });
}
