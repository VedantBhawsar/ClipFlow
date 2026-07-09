"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./use-api";

export function usePlans() {
  const api = useApi();
  return useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => api.getPlans(),
    staleTime: 60_000,
  });
}

export function useSubscription() {
  const api = useApi();
  return useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => api.getSubscription(),
    staleTime: 60_000,
  });
}