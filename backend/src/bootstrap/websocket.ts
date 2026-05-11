import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { PlivoService } from '../modules/plivo/services/PlivoService.js';
import { appConfig } from '../config/app.js';

export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: '/plivo-stream',
  });

  const plivoService = new PlivoService();

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');
    console.log('📊 [WEBSOCKET] Total clients before connection:', wss.clients.size);
    console.log('📊 [WEBSOCKET] New client readyState:', ws.readyState);

    // Extract user ID from URL query parameters
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    const targetUserId = appConfig.plivo.targetUserId;

    // Validate user if target user is configured
    if (targetUserId && userId !== targetUserId) {
      // console.log(`🚫 [WEBSOCKET] User ${userId} not authorized. Target user: ${targetUserId}`);
      ws.close(1008, 'Unauthorized user');
      return;
    }

    if (targetUserId && userId === targetUserId) {
      // console.log(`✅ [WEBSOCKET] User ${userId} authorized for Plivo streaming`);
    }

    if (!targetUserId) {
      // console.log('⚠️ [WEBSOCKET] No TARGET_USER_ID configured, allowing all users');
    }

    // Create a unique call ID for this connection
    const callId = Date.now().toString();

    // Store connection info with user ID
    const connectionInfo = { callId, user: userId, ws };
    (ws as any).connectionInfo = connectionInfo;

    console.log('📊 [WEBSOCKET] Total clients after connection:', wss.clients.size);

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'start') {
          console.log('📞 Call started:', msg.start);
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
          // console.log('🎧 Audio chunk received, size:', audioBuffer.length);

          try {
            // Transcribe audio chunk continuously
            const transcript = await plivoService.transcribeAudio(audioBuffer, callId);
            
            if (transcript.trim()) {
              // console.log(`📤 [BACKEND] Sending transcript for call ${callId}:`, transcript);
              
              const transcriptMessage = {
                type: 'transcript',
                callId,
                text: transcript,
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
            }
          } catch (transcribeError) {
            console.error('❌ [BACKEND] Transcription failed:', transcribeError);
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
          }
        }

        if (msg.event === 'stop') {
          console.log('📴 Call ended');
          
          // Process any remaining audio chunks first
          try {
            const finalChunkTranscript = await plivoService.processRemainingAudio(callId);
            if (finalChunkTranscript.trim()) {
              // Broadcast final chunk transcript
              Array.from(wss.clients).forEach((client: any) => {
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
            Array.from(wss.clients).forEach((client: any) => {
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
