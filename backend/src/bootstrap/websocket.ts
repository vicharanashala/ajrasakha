import { WebSocketServer } from 'ws';
import { IncomingMessage, Server } from 'http';

export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: '/plivo-stream',
  });

  wss.on('connection', (ws, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'start') {
          console.log('📞 Call started:', msg.start);
        }

        if (msg.event === 'media') {
          const audioBuffer = Buffer.from(msg.media.payload, 'base64');
          console.log('🎧 Audio chunk received, size:', audioBuffer.length);
          // Process audio chunk here
        }

        if (msg.event === 'stop') {
          console.log('📴 Call ended');
        }
      } catch (err) {
        console.log('⚠️ Non-JSON message received or parsing error');
      }
    });

    ws.on('close', () => {
      console.log('❌ Stream disconnected');
    });

    ws.on('error', (err) => {
      console.error('🔥 WS Error:', err);
    });
  });
};
