import { WebSocketServer, WebSocket } from 'ws';

import { IncomingMessage, Server } from 'http';
import { PLIVO_TYPES } from '../modules/plivo/types.js';
import type { PlivoService } from '../modules/plivo/services/PlivoService.js';
import { getContainer } from './loadModules.js';
// import path from 'path';
// import fs from 'fs';

const WS_PATH = '/plivo-stream';

export const initWebSocket = (server: Server) => {
  // noServer + manual upgrade routing. Passing { server, path } makes ws attach its own
  // 'upgrade' listener that calls abortHandshake(400) — destroying the socket — for ANY
  // path it doesn't own. With a second WebSocketServer on the same HTTP server (the
  // dashboard one) that meant whichever registered first killed the other's handshakes.
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url ?? '').split('?')[0];
    // Not ours — leave the socket alone so the other WS server can claim it.
    if (pathname !== WS_PATH) return;
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  const plivoService = getContainer().get<PlivoService>(PLIVO_TYPES.PlivoService);

  // const logsDir = path.join(process.cwd(), 'call_logs');
  // if (!fs.existsSync(logsDir)) {
  //   fs.mkdirSync(logsDir, { recursive: true });
  // }

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');

    // Create a unique filename for this call
    let callId = Date.now().toString();
    let isMediaStream = false;
    let isCallEnded = false;
    // const logFilePath = path.join(logsDir, `call_${callId}.txt`);

    // Audio buffer for batch processing
    const audioChunks: Buffer[] = [];

    const handleCallEnd = async () => {
      if (!isMediaStream || isCallEnded) return;
      isCallEnded = true;
      // console.log(`📴 Handling call end for ${callId}`);

      // Process any remaining audio chunks first
      try {
        const finalChunkResults = await plivoService.processRemainingAudio(callId.toString());
        for (const track of ['inbound', 'outbound'] as const) {
          const res = finalChunkResults[track];
          if (res.originalText.trim() || res.translatedText.trim()) {
            // Broadcast final chunk transcript
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

      // Get final transcript with dual-language support
      try {
        const finalInboundTranscript = plivoService.getTranscript(callId.toString(), 'inbound');
        const finalInboundTranslation = plivoService.getTranslation(callId.toString(), 'inbound');
        const finalOutboundTranscript = plivoService.getTranscript(callId.toString(), 'outbound');
        const finalOutboundTranslation = plivoService.getTranslation(callId.toString(), 'outbound');

        console.log(`[BACKEND LOG] Complete Call Summary:`);
        console.log(`Farmer: ${finalInboundTranscript} [Translation: ${finalInboundTranslation}]`);
        console.log(`Expert: ${finalOutboundTranscript} [Translation: ${finalOutboundTranslation}]`);

        // Broadcast final transcript with both languages
        Array.from(wss.clients).forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'call_end',
              callId,
              // Maintain backward compatibility for single field properties
              finalTranscript: `Farmer: ${finalInboundTranscript}\nExpert: ${finalOutboundTranscript}`,
              originalText: `Farmer: ${finalInboundTranscript}\nExpert: ${finalOutboundTranscript}`,
              translatedText: `Farmer: ${finalInboundTranslation}\nExpert: ${finalOutboundTranslation}`,
              // Add structured fields
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

          // Write initial session metadata to text log
          // fs.writeFileSync(
          //   logFilePath,
          //   `==================================================\n` +
          //   `📞 CALL START LOG\n` +
          //   `Timestamp: ${new Date().toISOString()}\n` +
          //   `Call ID: ${callId}\n` +
          //   `Details: ${JSON.stringify(msg.start, null, 2)}\n` +
          //   `==================================================\n\n`
          // );

          // Initialize Sarvam WebSocket streams for this call
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

            const label = result.track === 'inbound' ? 'Farmer' : 'Expert';
            // console.log(`[BACKEND LOG] ${label}: ${result.originalText} [Translation: ${result.translatedText}]`);

            // Append live transcription to the text log
            const timestamp = new Date().toISOString();
            // const logEntry =
            //   `[${timestamp}] ${label}:\n` +
            //   `  OriginalText:  ${result.originalText}\n` +
            //   `  TranslatedText: ${result.translatedText}\n` +
            //   `  DetectedLang:   ${result.detectedLanguage}\n\n`;
            // fs.appendFileSync(logFilePath, logEntry);

            // console.log(`📤 [BACKEND] Full message being sent:`, JSON.stringify(transcriptMessage, null, 2));

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
          const track = msg.media.track || 'inbound';
          plivoService.transcribeAudio(audioBuffer, callId, track).catch((transcribeError) => {
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
