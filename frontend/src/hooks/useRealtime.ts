import { useEffect, useRef, useCallback, useState } from 'react';
import { env } from '@/config/env';

type RealtimeEventHandler = (payload: Record<string, any>) => void;

export const useRealtime = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, RealtimeEventHandler[]>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = env.apiBaseUrl().replace(/^http/, 'ws').replace(/\/api$/, '') + '/realtime';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
      console.log('[Realtime] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type as string;
        const handlers = handlersRef.current.get(type) || [];
        handlers.forEach((handler) => handler(data));
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('[Realtime] Disconnected, attempting reconnect...');
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttempts.current++;
        connect();
      }, delay);
    };

    ws.onerror = (err) => {
      console.error('[Realtime] WebSocket error:', err);
    };
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const on = useCallback((type: string, handler: RealtimeEventHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, []);
    }
    handlersRef.current.get(type)!.push(handler);
  }, []);

  const off = useCallback((type: string, handler?: RealtimeEventHandler) => {
    if (!handler) {
      handlersRef.current.delete(type);
    } else {
      const handlers = handlersRef.current.get(type) || [];
      handlersRef.current.set(type, handlers.filter((h) => h !== handler));
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connect, disconnect, on, off, isConnected };
};
