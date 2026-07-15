import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { env } from "@/config/env";
import type { PublicDashboardCounts } from "@/hooks/services/publicStatsService";
import { PUBLIC_COUNTS_KEY } from "./usePublicStats";

/** Derive the dashboard WebSocket URL from the API base, e.g.
 *  https://host/api → wss://host/ws/dashboard. The socket lives at the root, not under /api,
 *  and connects straight to the backend host (not through Firebase Hosting). */
function dashboardSocketUrl(): string {
  const base = env.apiBaseUrl(); // e.g. https://reviewer-backend-….run.app/api
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/dashboard";
  url.search = "";
  return url.toString();
}

/**
 * Keeps the public dashboard's headline counts live over a WebSocket. Each pushed message
 * is written straight into the useGetPublicCounts() cache, so components reading that query
 * update with no polling.
 *
 * Resilient by design: it reconnects with capped backoff if the socket drops (Cloud Run
 * recycles idle connections), and closes cleanly on unmount. If the socket never connects,
 * the one-shot fetch in useGetPublicCounts() still provides a value.
 */
export function usePublicCountsSocket(): void {
  const queryClient = useQueryClient();
  const closedByUs = useRef(false);

  useEffect(() => {
    closedByUs.current = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(dashboardSocketUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      ws = socket;

      socket.onopen = () => {
        retry = 0;
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            data?: PublicDashboardCounts;
          };
          if (msg.type === "counts" && msg.data) {
            queryClient.setQueryData(PUBLIC_COUNTS_KEY, msg.data);
          }
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (!closedByUs.current) scheduleReconnect();
      };

      // Let onclose drive reconnection (an error is always followed by a close).
      socket.onerror = () => socket.close();
    };

    const scheduleReconnect = () => {
      if (closedByUs.current) return;
      // 1s, 2s, 4s … capped at 30s.
      const delay = Math.min(30_000, 1000 * 2 ** retry);
      retry += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [queryClient]);
}
