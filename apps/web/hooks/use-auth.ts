"use client";

import { useAuthContext } from "@/lib/auth-context";

/**
 * Convenience hook for components that just want the auth surface
 * without the (long) import path.
 */
export function useAuth() {
  return useAuthContext();
}
