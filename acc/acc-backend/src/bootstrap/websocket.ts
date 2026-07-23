import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { PLIVO_TYPES } from '../modules/plivo/types.js';
import type { PlivoService } from '../modules/plivo/services/PlivoService.js';
import { getContainer } from './loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { UserService } from '#root/modules/user/services/UserService.js';

export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: '/plivo-stream',
  });

  const plivoService = getContainer().get<PlivoService>(PLIVO_TYPES.PlivoService);
  const userService = getContainer().get<UserService>(GLOBAL_TYPES.UserService);

  // Map callId -> Set of admin WebSocket subscribers listening to live audio
  const audioSubscribers = new Map<string, Set<WebSocket>>();

  const removeSubscriberFromAll = (ws: WebSocket) => {
    audioSubscribers.forEach((subscribers, cId) => {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        audioSubscribers.delete(cId);
      }
    });
  };

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');

    let callId = Date.now().toString();
    let isMediaStream = false;
    let isCallEnded = false;
    const audioChunks: Buffer[] = [];

    const handleCallEnd = async () => {
      if (!isMediaStream || isCallEnded) return;
      isCallEnded = true;

      // Remove call from active list & subscribers
      plivoService.removeActiveCall(callId.toString());
      audioSubscribers.delete(callId.toString());

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

            // Notify admin UI of call termination
            client.send(JSON.stringify({
              type: 'active_call_ended',
              callId,
              timestamp: new Date().toISOString()
            }));
          }
        });
      } catch (finalError) {
        console.error('Final transcript failed:', finalError);
      }

      const agentUserId = plivoService.getCallAgent(callId.toString());

      try {
        await plivoService.saveCallDetails(callId.toString());
      } catch (saveError) {
        console.error('❌ [WEBSOCKET] Failed to save call details:', saveError);
      }

      try {
        plivoService.clearTranscript(callId.toString());
      } catch (clearError) {
        console.error('❌ [WEBSOCKET] Failed to clear transcript:', clearError);
      }

      if (agentUserId) {
        try {
          console.log(`♻️ [WEBSOCKET] Marking agent ${agentUserId} as available (call ended)`);
          await userService.markAgentAsAvailable(agentUserId);
        } catch (error) {
          console.error(`❌ [WEBSOCKET] Failed to mark agent ${agentUserId} as available:`, error);
        }
      } else {
        console.log(`⚠️ [WEBSOCKET] No agent mapped to call ${callId.toString()}`);
      }
    };

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        // Admin Subscription & Live Control Commands
        if (msg.type === 'subscribe_live_audio' && msg.callId) {
          console.log(`🎧 [WEBSOCKET] Admin subscribed to live audio for call ${msg.callId}`);
          if (!audioSubscribers.has(msg.callId)) {
            audioSubscribers.set(msg.callId, new Set());
          }
          audioSubscribers.get(msg.callId)!.add(ws);
          return;
        }

        if (msg.type === 'unsubscribe_live_audio' && msg.callId) {
          console.log(`🎧 [WEBSOCKET] Admin unsubscribed from live audio for call ${msg.callId}`);
          if (audioSubscribers.has(msg.callId)) {
            audioSubscribers.get(msg.callId)!.delete(ws);
          }
          return;
        }

        if (msg.type === 'get_active_calls') {
          const activeCalls = plivoService.getActiveCalls();
          ws.send(JSON.stringify({
            type: 'active_calls_list',
            activeCalls,
            timestamp: new Date().toISOString()
          }));
          return;
        }

        // Plivo Telecom Events
        if (msg.event === 'start') {
          isMediaStream = true;
          callId = msg.start.callId;
          console.log('📞 Call started:', msg.start);

          const activeCallInfo = plivoService.registerActiveCall(callId, {
            farmerNumber: msg.start.from || msg.start.callerId || 'Unknown',
            startTime: new Date().toISOString()
          });

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

          // Broadcast active call start to all connected admin/frontend clients
          Array.from(wss.clients).forEach((client: any) => {
            if (client !== ws && client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'call_start',
                callId,
                data: msg.start
              }));

              client.send(JSON.stringify({
                type: 'active_call_started',
                callId,
                callInfo: activeCallInfo,
                timestamp: new Date().toISOString()
              }));
            }
          });
        }

        if (msg.event === 'media') {
          const audioBuffer = Buffer.from(msg.media.payload, 'base64');
          audioChunks.push(audioBuffer);
          const track = msg.media.track || 'inbound';

          // Relay live PCM audio chunk to all admins listening to this callId
          const subscribers = audioSubscribers.get(callId.toString());
          if (subscribers && subscribers.size > 0) {
            const liveChunkMsg = JSON.stringify({
              type: 'live_audio_chunk',
              callId: callId.toString(),
              track,
              payload: msg.media.payload,
              timestamp: new Date().toISOString()
            });
            subscribers.forEach((subscriber) => {
              if (subscriber.readyState === 1) {
                subscriber.send(liveChunkMsg);
              }
            });
          }

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
      removeSubscriberFromAll(ws);

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
      removeSubscriberFromAll(ws);
    });
  });
};
