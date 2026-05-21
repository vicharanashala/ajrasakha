import { WebSocketServer, WebSocket } from 'ws';

import { IncomingMessage, Server } from 'http';
import { PlivoService } from '../modules/plivo/services/PlivoService.js';
// import path from 'path';
// import fs from 'fs';

export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: '/plivo-stream',
  });
const plivoService = new PlivoService();

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');

    // Create a unique filename for this call
    const callId = Date.now().toString();
    // const filePath = path.join(process.cwd(), `call_${callId}.mp3`);
    // const fileStream = fs.createWriteStream(filePath);

    // Audio buffer for batch processing
    const audioChunks: Buffer[] = [];

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'start') {
          console.log('📞 Call started:', msg.start);
          
          // Initialize Sarvam WebSocket streams for this call
          plivoService.initializeStreams(callId, (result) => {
            const transcriptMessage = {
              type: 'transcript',
              callId,
              text: result.originalText || result.translatedText || '',
              originalText: result.originalText,
              translatedText: result.translatedText,
              detectedLanguage: result.detectedLanguage,
              timestamp: new Date().toISOString()
            };

            console.log(`📤 [BACKEND] Full message being sent:`, JSON.stringify(transcriptMessage, null, 2));

            // Broadcast transcript to frontend clients
            let clientCount = 0;
            Array.from(wss.clients).forEach((client: any) => {
              if (client.readyState === 1) {
                clientCount++;
                client.send(JSON.stringify(transcriptMessage));
              }
            });
            console.log(`📤 [BACKEND] Transcript sent to ${clientCount} frontend clients`);
          });

          // Broadcast call start to frontend
          Array.from(wss.clients).forEach((client: any) => {
            if (client !== ws && client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'call_start',
                callId,
                data: msg.start
              }));
            }
          });
        }

        if (msg.event === 'media') {
          const audioBuffer = Buffer.from(msg.media.payload, 'base64');
          audioChunks.push(audioBuffer);
          plivoService.transcribeAudio(audioBuffer, callId).catch((transcribeError) => {
            console.error('❌ [BACKEND] transcribeAudio failed:', transcribeError);
            // Broadcast error to frontend
            Array.from(wss.clients).forEach((client: any) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'transcription_error',
                  callId,
                  error: transcribeError.message
                }));
              }
            });
          });
        }

        if (msg.event === 'stop') {
          console.log('📴 Call ended');
          
          // Process any remaining audio chunks first
          try {
            const finalChunkResult = await plivoService.processRemainingAudio(callId.toString());
            if (finalChunkResult.originalText.trim() || finalChunkResult.translatedText.trim()) {
              // Broadcast final chunk transcript
              Array.from(wss.clients).forEach((client: any) => {
                if (client.readyState === 1) {
                  client.send(JSON.stringify({
                    type: 'transcript',
                    callId,
                    text: finalChunkResult.originalText || finalChunkResult.translatedText || '',
                    originalText: finalChunkResult.originalText,
                    translatedText: finalChunkResult.translatedText,
                    timestamp: new Date().toISOString()
                  }));
                }
              });
            }
          } catch (finalChunkError) {
            console.error('Final chunk processing failed:', finalChunkError);
          }

          // Get final transcript with dual-language support
          try {
            const finalTranscript = plivoService.getTranscript(callId.toString());
            const finalTranslation = plivoService.getTranslation(callId.toString());
            const detectedLanguage = plivoService.getDetectedLanguage(callId.toString());

            // Broadcast final transcript with both languages
            Array.from(wss.clients).forEach((client: any) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'call_end',
                  callId,
                  finalTranscript,
                  originalText: finalTranscript,
                  translatedText: finalTranslation,
                  detectedLanguage: detectedLanguage,
                  timestamp: new Date().toISOString()
                }));
              }
            });
          } catch (finalError) {
            console.error('Final transcript failed:', finalError);
          }

          plivoService.clearTranscript(callId.toString());
        }
      } catch (err) {
        console.log('⚠️ Non-JSON message received or parsing error');
      }
    });

    ws.on('close', () => {
      console.log('❌ Stream disconnected');
      plivoService.clearTranscript(callId.toString());

      // Notify frontend of disconnection
      Array.from(wss.clients).forEach((client: any) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'call_disconnected',
            callId,
            timestamp: new Date().toISOString()
          }));
        }
      });
    });

    ws.on('error', (err) => {
      console.error('🔥 WS Error:', err);
    });
  });
};
