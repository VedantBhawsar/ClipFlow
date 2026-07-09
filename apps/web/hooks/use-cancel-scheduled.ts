"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./use-api";

export function useCancelScheduled() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.cancelScheduled(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription"] });
    },
  });
}