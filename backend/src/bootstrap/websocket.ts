import { WebSocketServer } from 'ws';
import { IncomingMessage, Server } from 'http';
import { PlivoService } from '../modules/plivo/services/PlivoService.js';

export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: '/plivo-stream',
  });

  const plivoService = new PlivoService();

  wss.on('connection', async (ws, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');

    // Skip authentication for now
    const user = null;

    // Create a unique call ID for this connection
    const callId = Date.now().toString();

    // Store connection info
    const connectionInfo = { callId, user, ws };
    (ws as any).connectionInfo = connectionInfo;

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'start') {
          console.log('📞 Call started:', msg.start);
          // Broadcast call start to frontend
          wss.clients.forEach((client) => {
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
          console.log('🎧 Audio chunk received, size:', audioBuffer.length);

          try {
            // Transcribe audio chunk continuously
            const transcript = await plivoService.transcribeAudio(audioBuffer, callId);
            
            if (transcript.trim()) {
              console.log(`📤 [BACKEND] Sending transcript for call ${callId}:`, transcript);
              
              const transcriptMessage = {
                type: 'transcript',
                callId,
                text: transcript,
                timestamp: new Date().toISOString()
              };
              
              console.log(`📤 [BACKEND] Full message being sent:`, JSON.stringify(transcriptMessage, null, 2));
              
              // Broadcast transcript to frontend clients
              let clientCount = 0;
              wss.clients.forEach((client) => {
                if (client.readyState === 1) {
                  clientCount++;
                  client.send(JSON.stringify(transcriptMessage));
                }
              });
              
              console.log(`📤 [BACKEND] Transcript sent to ${clientCount} frontend clients`);
            }
          } catch (transcribeError) {
            console.error('❌ [BACKEND] Transcription failed:', transcribeError);
            // Broadcast error to frontend
            wss.clients.forEach((client) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'transcription_error',
                  callId,
                  error: transcribeError.message
                }));
              }
            });
          }
        }

        if (msg.event === 'stop') {
          console.log('📴 Call ended');
          
          // Process any remaining audio chunks first
          try {
            const finalChunkTranscript = await plivoService.processRemainingAudio(callId);
            if (finalChunkTranscript.trim()) {
              // Broadcast final chunk transcript
              wss.clients.forEach((client) => {
                if (client.readyState === 1) {
                  client.send(JSON.stringify({
                    type: 'transcript',
                    callId,
                    text: finalChunkTranscript,
                    timestamp: new Date().toISOString()
                  }));
                }
              });
            }
          } catch (finalChunkError) {
            console.error('Final chunk processing failed:', finalChunkError);
          }
          
          // Get final English transcript
          try {
            const finalTranscript = await plivoService.getFinalEnglishTranscript(callId);
            
            // Broadcast final transcript
            wss.clients.forEach((client) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'call_end',
                  callId,
                  finalTranscript,
                  timestamp: new Date().toISOString()
                }));
              }
            });
          } catch (finalError) {
            console.error('Final transcript failed:', finalError);
          }

          plivoService.clearTranscript(callId);
        }
      } catch (err) {
        console.log('⚠️ Non-JSON message received or parsing error');
      }
    });

    ws.on('close', () => {
      console.log('❌ Stream disconnected');
      plivoService.clearTranscript(callId);
      
      // Notify frontend of disconnection
      wss.clients.forEach((client) => {
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
