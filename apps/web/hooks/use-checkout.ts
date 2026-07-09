"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./use-api";
import type { CreateCheckoutRequest } from "@clipflow/types";

export function useCreateCheckout() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateCheckoutRequest) => api.createCheckoutSession(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      window.location.href = data.checkoutUrl;
    },
  });
}