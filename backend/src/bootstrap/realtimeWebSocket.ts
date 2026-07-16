import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';

let realtimeWss: WebSocketServer | null = null;

/**
 * Initialize a separate WebSocket server for real-time allocation events.
 * Mounted on path `/realtime` (separate from Plivo's `/plivo-stream`).
 */
export const initRealtimeWebSocket = (server: Server) => {
  realtimeWss = new WebSocketServer({
    server,
    path: '/realtime',
  });

  realtimeWss.on('connection', (ws: WebSocket) => {
    console.log('🔌 Realtime WebSocket client connected');
    ws.on('close', () => console.log('❌ Realtime WebSocket client disconnected'));
    ws.on('error', (err) => console.error('🔥 Realtime WS Error:', err));
  });

  console.log('✅ Realtime WebSocket server initialized on /realtime');
};

/**
 * Broadcast a typed event to all connected realtime clients.
 */
export const broadcastToAll = (type: string, payload: Record<string, any>) => {
  if (!realtimeWss) return;
  const message = JSON.stringify({ type, ...payload, timestamp: new Date().toISOString() });
  Array.from(realtimeWss.clients).forEach((client: any) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};
