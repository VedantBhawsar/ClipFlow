"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";
import type { UpdatePreferencesRequest, UserPreferences } from "@clipflow/types";

/**
 * Partial update of the authenticated user's preferences. The server
 * returns the merged preferences object; we write it into the bundle
 * cache so any consumer reading preferences (sidebar? settings forms?)
 * sees the new values without a refetch.
 *
 * Local form state remains the source of truth for "what the user has
 * flipped but not saved yet" — that already feels instant — and the
 * mutation reconciles the cache once the server confirms.
 */
export function useUpdatePreferences() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<UserPreferences, Error, UpdatePreferencesRequest>({
    mutationFn: (body) => api.updatePreferences(body),
    onSuccess: (preferences) => {
      qc.setQueryData(queryKeys.user.bundle(), (old) =>
        old ? { ...old, preferences } : old,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.user.bundle() });
    },
  });
}