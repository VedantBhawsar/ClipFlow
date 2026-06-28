"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { SseVideoEvent } from "@clipflow/types";
import { env } from "@/lib/env";

export interface SseConnection {
  events: SseVideoEvent[];
  connected: boolean;
  error: string | null;
  clear: () => void;
}

/**
 * Subscribe to SSE events for video processing.
 *
 * @param videoId Optional. When provided, subscribes to video-specific
 *   events; otherwise subscribes to the user's global event stream.
 * @param options.enabled When false, skips opening the EventSource
 *   connection entirely. Default true. Use this to only connect when
 *   there are videos that need progress tracking.
 */
export function useVideoSSE(
  videoId?: string,
  options?: { enabled?: boolean },
): SseConnection {
  const enabled = options?.enabled ?? true;
  const { data: session } = useSession();
  const token = session?.accessToken ?? null;
  const [events, setEvents] = useState<SseVideoEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventsRef = useRef<SseVideoEvent[]>([]);

  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SseVideoEvent;
        eventsRef.current = [...eventsRef.current, data];
        setEvents([...eventsRef.current]);
      } catch {
        // skip malformed events
      }
    },
    [],
  );

  const handleOpen = useCallback(() => {
    setConnected(true);
    setError(null);
  }, []);

  const handleError = useCallback(() => {
    setConnected(false);
    setError("Connection lost. Reconnecting…");
  }, []);

  useEffect(() => {
    if (!token || !enabled) {
      setConnected(false);
      return;
    }

    const path = videoId
      ? `/api/videos/${videoId}/stream`
      : "/api/videos/stream";
    const url = `${env.apiBaseUrl}${path}?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("open", handleOpen);
    es.addEventListener("status_update", handleEvent);
    es.addEventListener("progress", handleEvent);
    es.addEventListener("error", handleError);
    es.addEventListener("heartbeat", () => {
      // keep connection alive — no action needed
    });

    return () => {
      es.removeEventListener("open", handleOpen);
      es.removeEventListener("status_update", handleEvent);
      es.removeEventListener("progress", handleEvent);
      es.removeEventListener("error", handleError);
      es.close();
      eventSourceRef.current = null;
    };
  }, [token, enabled, videoId, handleEvent, handleOpen, handleError]);

  return {
    events,
    connected,
    error,
    clear: () => {
      eventsRef.current = [];
      setEvents([]);
      setError(null);
    },
  };
}
