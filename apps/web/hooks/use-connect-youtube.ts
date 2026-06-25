"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import type { YouTubeConnection } from "@clipflow/types";

/**
 * Connect the authenticated user's YouTube channel by exchanging an
 * OAuth authorization code. The server returns the full connection
 * record (channelId, channelTitle, thumbnailUrl, …) so we write the
 * authoritative server response into the settings bundle cache.
 *
 * Because the server knows the truth (we don't have the channelId
 * client-side before the round-trip), we rely on onSuccess — not an
 * onMutate optimistic guess — for the cache update. The UI still feels
 * instant because the mutation has already started and TanStack Query
 * re-renders synchronously when the cache changes.
 */
export function useConnectYouTube() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<YouTubeConnection, Error, string>({
    mutationFn: (code) => api.connectYouTube(code),
    onSuccess: (connection) => {
      qc.setQueryData(queryKeys.settings.bundle(), (old) =>
        old ? { ...old, youtubeConnection: connection } : old,
      );
      qc.setQueryData(queryKeys.settings.youtubeConnection(), connection);
      // Reconcile in the background in case anything else changed server-side.
      void qc.invalidateQueries({ queryKey: queryKeys.settings.bundle() });
    },
  });
}
