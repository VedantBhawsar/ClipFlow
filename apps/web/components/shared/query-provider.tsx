"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { makeQueryClient } from "@/lib/query-client";

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * App-wide TanStack Query provider.
 *
 * The QueryClient is created lazily inside useState so:
 *  - On the server, no client is constructed (TanStack Query is no-op SSR).
 *  - On the client, the same client instance survives client-side
 *    navigation within a session, but a fresh page load gets a fresh
 *    client — no stale caches carried over from previous sessions.
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => makeQueryClient());
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
