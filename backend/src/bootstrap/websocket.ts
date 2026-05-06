import { WebSocketServer } from 'ws';
import { IncomingMessage, Server } from 'http';
import fs from 'fs';
import path from 'path';

export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: '/plivo-stream',
  });

  wss.on('connection', (ws, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');

    // Create a unique filename for this call
    const callId = Date.now();
    const filePath = path.join(process.cwd(), `call_${callId}.raw`);
    const fileStream = fs.createWriteStream(filePath);

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'start') {
          console.log('📞 Call started:', msg.start);
        }

        if (msg.event === 'media') {
          const audioBuffer = Buffer.from(msg.media.payload, 'base64');
          console.log('🎧 Audio chunk received, size:', audioBuffer.length);
          fileStream.write(audioBuffer);
          //     // Calculate volume level (RMS - Root Mean Square)
          //     let sum = 0;
          //     for (let i = 0; i < audioBuffer.length; i++) {
          //       // 128 is the 'zero' point for mu-law bytes
          //       sum += Math.pow(audioBuffer[i] - 128, 2);
          //     }
          //     const rms = Math.sqrt(sum / audioBuffer.length);
          //     const visualBar = '█'.repeat(Math.min(Math.floor(rms / 2), 30));

          //     console.log(`🎤 [${new Date().toISOString()}] Volume: ${visualBar}`);
          //   // Process audio chunk here
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
