import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { PLIVO_TYPES } from '../modules/plivo/types.js';
import type { PlivoService } from '../modules/plivo/services/PlivoService.js';
import { getContainer } from './loadModules.js';

export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: '/plivo-stream',
  });
  
  const plivoService = getContainer().get<PlivoService>(PLIVO_TYPES.PlivoService);

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');

    let callId = Date.now().toString();
    let isMediaStream = false;
    let isCallEnded = false;
    const audioChunks: Buffer[] = [];

    const handleCallEnd = async () => {
      if (!isMediaStream || isCallEnded) return;
      isCallEnded = true;

      try {
        const finalChunkResults = await plivoService.processRemainingAudio(callId.toString());
        for (const track of ['inbound', 'outbound'] as const) {
          const res = finalChunkResults[track];
          if (res.originalText.trim() || res.translatedText.trim()) {
            Array.from(wss.clients).forEach((client: any) => {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  type: 'transcript',
                  callId,
                  text: res.originalText || res.translatedText || '',
                  originalText: res.originalText,
                  translatedText: res.translatedText,
                  track,
                  timestamp: new Date().toISOString()
                }));
              }
            });
          }
        }
      } catch (finalChunkError) {
        console.error('Final chunk processing failed:', finalChunkError);
      }

      try {
        const finalInboundTranscript = plivoService.getTranscript(callId.toString(), 'inbound');
        const finalInboundTranslation = plivoService.getTranslation(callId.toString(), 'inbound');
        const finalOutboundTranscript = plivoService.getTranscript(callId.toString(), 'outbound');
        const finalOutboundTranslation = plivoService.getTranslation(callId.toString(), 'outbound');

        console.log(`[BACKEND LOG] Complete Call Summary:`);
        console.log(`Farmer: ${finalInboundTranscript} [Translation: ${finalInboundTranslation}]`);
        console.log(`Expert: ${finalOutboundTranscript} [Translation: ${finalOutboundTranslation}]`);

        Array.from(wss.clients).forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'call_end',
              callId,
              finalTranscript: `Farmer: ${finalInboundTranscript}\nExpert: ${finalOutboundTranscript}`,
              originalText: `Farmer: ${finalInboundTranscript}\nExpert: ${finalOutboundTranscript}`,
              translatedText: `Farmer: ${finalInboundTranslation}\nExpert: ${finalOutboundTranslation}`,
              caller: {
                transcript: finalInboundTranscript,
                translation: finalInboundTranslation,
                detectedLanguage: plivoService.getDetectedLanguage(callId.toString(), 'inbound')
              },
              agent: {
                transcript: finalOutboundTranscript,
                translation: finalOutboundTranslation,
                detectedLanguage: plivoService.getDetectedLanguage(callId.toString(), 'outbound')
              },
              timestamp: new Date().toISOString()
            }));
          }
        });
      } catch (finalError) {
        console.error('Final transcript failed:', finalError);
      }

      await plivoService.saveCallDetails(callId.toString());
      plivoService.clearTranscript(callId.toString());
    };

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'start') {
          isMediaStream = true;
          callId = msg.start.callId;
          console.log('📞 Call started:', msg.start);

          plivoService.initializeStreams(callId, (result) => {
            const transcriptMessage = {
              type: 'transcript',
              callId,
              text: result.originalText || result.translatedText || '',
              originalText: result.originalText,
              translatedText: result.translatedText,
              detectedLanguage: result.detectedLanguage,
              track: result.track,
              timestamp: new Date().toISOString()
            };

            let clientCount = 0;
            Array.from(wss.clients).forEach((client: any) => {
              if (client.readyState === 1) {
                clientCount++;
                client.send(JSON.stringify(transcriptMessage));
              }
            });
            console.log(`📤 [BACKEND] Transcript sent to ${clientCount} frontend clients`);
          });

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
          const track = msg.media.track || 'inbound';
          plivoService.transcribeAudio(audioBuffer, callId, track).catch((transcribeError) => {
            console.error('❌ [BACKEND] transcribeAudio failed:', transcribeError);
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
          await handleCallEnd();
        }
      } catch (err) {
        console.log('⚠️ Non-JSON message received or parsing error');
      }
    });

    ws.on('close', async () => {
      console.log('❌ Stream disconnected');

      if (isMediaStream) {
        await handleCallEnd();
      } else {
        plivoService.clearTranscript(callId.toString());
      }

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
