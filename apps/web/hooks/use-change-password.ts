"use client";

import { useMutation } from "@tanstack/react-query";

import { useApi } from "@/hooks/use-api";
import type { ChangePasswordRequest } from "@clipflow/types";

/**
 * Change the authenticated user's password. The server returns 204;
 * callers handle their own success UI (the form resets, a toast
 * fires) on mutateAsync resolution.
 *
 * No bundle-cache update needed — the access token, refresh token,
 * and user identity are unchanged; this is a pure credential rotation.
 */
export function useChangePassword() {
  const api = useApi();
  return useMutation<void, Error, ChangePasswordRequest>({
    mutationFn: (body) => api.changePassword(body),
  });
}