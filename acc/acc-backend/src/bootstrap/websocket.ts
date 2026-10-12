import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { PLIVO_TYPES } from '../modules/plivo/types.js';
import type { PlivoService } from '../modules/plivo/services/PlivoService.js';
import { getContainer } from './loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { UserService } from '#root/modules/user/services/UserService.js';
import type { ICallDetailsRepository } from '#shared/database/interfaces/ICallDetailsRepository.js';
import type { IUserRepository } from '#shared/database/interfaces/IUserRepository.js';
import { getFromContainer } from 'routing-controllers';
import { FirebaseAuthService } from '#root/modules/auth/services/FirebaseAuthService.js';

export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({
    server,
    path: '/plivo-stream',
  });

  // 30-second ping/pong heartbeat to prevent idle proxy/Cloud Run terminations
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client: any) => {
      if (client.isAlive === false) {
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  const plivoService = getContainer().get<PlivoService>(PLIVO_TYPES.PlivoService);
  const userService = getContainer().get<UserService>(GLOBAL_TYPES.UserService);
  const callDetailsRepository = getContainer().get<ICallDetailsRepository>(PLIVO_TYPES.CallDetailsRepository);
  const userRepository = getContainer().get<IUserRepository>(GLOBAL_TYPES.UserRepository);

  const sendTargeted = (targetCallId: string, payload: any) => {
    const assignedAgentId = plivoService.getCallAgent(targetCallId);
    let recipientCount = 0;

    Array.from(wss.clients).forEach((client: any) => {
      if (client.readyState === 1 && !client.isMediaStream) {
        const isTargetAgent = Boolean(
          assignedAgentId &&
          (client.userId === assignedAgentId || client.agentNumber === assignedAgentId)
        );

        // Deliver strictly to the assigned call agent for this call to guarantee zero cross-talk
        if (isTargetAgent) {
          try {
            client.send(JSON.stringify(payload));
            recipientCount++;
          } catch (sendErr) {
            console.warn('[WEBSOCKET] Error sending message to client:', sendErr);
          }
        }
      }
    });

    return recipientCount;
  };

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    console.log('🔌 Plivo stream connected');

    (ws as any).isAlive = true;
    (ws as any).isMediaStream = false;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    let callId = Date.now().toString();
    let isMediaStream = false;
    let isCallEnded = false;
    // Unused in-memory buffer commented out to prevent heap memory exhaustion during calls
    // const audioChunks: Buffer[] = [];

    // Authenticate client if token query param is provided
    try {
      const reqUrl = req.url || '';
      const tokenMatch = reqUrl.match(/[?&]token=([^&]+)/);
      if (tokenMatch && tokenMatch[1]) {
        const rawToken = decodeURIComponent(tokenMatch[1]);
        const firebaseAuthService = getFromContainer(FirebaseAuthService);
        const decodedUser = await firebaseAuthService.getCurrentUserFromToken(rawToken);
        if (decodedUser) {
          (ws as any).userId = decodedUser._id?.toString() || null;
          (ws as any).agentNumber = decodedUser.agent || null;
          (ws as any).userRole = decodedUser.role || null;
          console.log(`[WEBSOCKET] Client authenticated: userId=${(ws as any).userId}, agent=${(ws as any).agentNumber}, role=${(ws as any).userRole}`);
        }
      }
    } catch (authError: any) {
      console.warn('[WEBSOCKET] Token authentication skipped/failed:', authError.message || authError);
    }


    const handleCallEnd = async () => {
      if (!isMediaStream || isCallEnded) return;
      isCallEnded = true;

      try {
        const finalChunkResults = await plivoService.processRemainingAudio(callId.toString());
        for (const track of ['inbound', 'outbound'] as const) {
          const res = finalChunkResults[track];
          if (res.originalText.trim() || res.translatedText.trim()) {
            sendTargeted(callId.toString(), {
              type: 'transcript',
              callId,
              text: res.originalText || res.translatedText || '',
              originalText: res.originalText,
              translatedText: res.translatedText,
              track,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (finalChunkError) {
        console.error('Final chunk processing failed:', finalChunkError);
      }

      try {
        const isOutbound = plivoService.getCallDirection(callId.toString()) === 'outbound';
        const callerTrack = isOutbound ? 'outbound' : 'inbound';
        const agentTrack = isOutbound ? 'inbound' : 'outbound';

        const finalCallerTranscript = plivoService.getTranscript(callId.toString(), callerTrack);
        const finalCallerTranslation = plivoService.getTranslation(callId.toString(), callerTrack);
        const finalAgentTranscript = plivoService.getTranscript(callId.toString(), agentTrack);
        const finalAgentTranslation = plivoService.getTranslation(callId.toString(), agentTrack);

        console.log(`[BACKEND LOG] Complete Call Summary (${isOutbound ? 'Outbound' : 'Inbound'}):`);
        console.log(`Farmer (${callerTrack}): ${finalCallerTranscript} [Translation: ${finalCallerTranslation}]`);
        console.log(`Expert (${agentTrack}): ${finalAgentTranscript} [Translation: ${finalAgentTranslation}]`);

        sendTargeted(callId.toString(), {
          type: 'call_end',
          callId,
          finalTranscript: `Farmer: ${finalCallerTranscript}\nExpert: ${finalAgentTranscript}`,
          originalText: `Farmer: ${finalCallerTranscript}\nExpert: ${finalAgentTranscript}`,
          translatedText: `Farmer: ${finalCallerTranslation}\nExpert: ${finalAgentTranslation}`,
          caller: {
            transcript: finalCallerTranscript,
            translation: finalCallerTranslation,
            detectedLanguage: plivoService.getDetectedLanguage(callId.toString(), callerTrack)
          },
          agent: {
            transcript: finalAgentTranscript,
            translation: finalAgentTranslation,
            detectedLanguage: plivoService.getDetectedLanguage(callId.toString(), agentTrack)
          },
          timestamp: new Date().toISOString()
        });
      } catch (finalError) {
        console.error('Final transcript failed:', finalError);
      }

      let agentUserId = plivoService.getCallAgent(callId.toString());
      if (!agentUserId) {
        // Fallback: recover agent from DB if memory had a cache miss across Cloud Run instances
        try {
          const doc = await callDetailsRepository.getByCallUuid(callId.toString());
          if (doc?.agent?.userid) {
            agentUserId = doc.agent.userid.toString();
          } else {
            const assignedUser = await userRepository.findByCurrentCallUuid(callId.toString());
            if (assignedUser) {
              agentUserId = assignedUser._id.toString();
            }
          }
        } catch (recoverErr) {
          console.warn(`[WEBSOCKET] Failed to recover agent for call ${callId} at call end:`, recoverErr);
        }
      }

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

        if (msg.event === 'start') {
          isMediaStream = true;
          (ws as any).isMediaStream = true;
          callId = msg.start.callId;
          console.log('📞 Call started:', msg.start);

          // Database fallback for cross-instance agent mapping
          let assignedAgentId = plivoService.getCallAgent(callId);
          if (!assignedAgentId) {
            console.log(`🔍 [WEBSOCKET] Cache miss in memory for call ${callId}. Querying DB fallback...`);
            try {
              let recoveredAgentUserId: string | undefined;
              let recoveredAgentNumber: string | undefined;
              let recoveredFrom: string | undefined;
              let recoveredTo: string | undefined;
              let recoveredDirection: 'inbound' | 'outbound' = 'inbound';
              let recoveredStartTime = new Date();

              const callDoc = await callDetailsRepository.getByCallUuid(callId);
              if (callDoc) {
                recoveredFrom = callDoc.from;
                recoveredTo = callDoc.to;
                recoveredDirection = (callDoc.direction as any) || 'inbound';
                if (callDoc.createdAt) recoveredStartTime = new Date(callDoc.createdAt);
                if (callDoc.agent?.userid) {
                  recoveredAgentUserId = callDoc.agent.userid.toString();
                  recoveredAgentNumber = callDoc.agent.username;
                }
              }

              if (!recoveredAgentUserId) {
                const assignedUser = await userRepository.findByCurrentCallUuid(callId);
                if (assignedUser) {
                  recoveredAgentUserId = assignedUser._id.toString();
                  recoveredAgentNumber = assignedUser.agent;
                  recoveredFrom = assignedUser.currentCallPhoneNumber || recoveredFrom;
                }
              }

              if (recoveredAgentUserId) {
                console.log(`✅ [WEBSOCKET] Successfully recovered agent ${recoveredAgentUserId} (${recoveredAgentNumber || 'unknown'}) from DB for call ${callId}`);
                plivoService.registerCall(callId, {
                  from: recoveredFrom,
                  to: recoveredTo,
                  agentUserId: recoveredAgentUserId,
                  agentNumber: recoveredAgentNumber,
                  direction: recoveredDirection,
                  startTime: recoveredStartTime,
                });
                assignedAgentId = recoveredAgentUserId;
              } else {
                console.warn(`⚠️ [WEBSOCKET] Could not recover agent from DB for call ${callId}`);
              }
            } catch (dbFallbackErr) {
              console.error(`❌ [WEBSOCKET] Error during DB fallback agent recovery for call ${callId}:`, dbFallbackErr);
            }
          }

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

            const clientCount = sendTargeted(callId, transcriptMessage);
            console.log(`[BACKEND] Transcript sent to ${clientCount} targeted frontend clients`);
          });

          sendTargeted(callId, {
            type: 'call_start',
            callId,
            data: msg.start
          });
        }

        if (msg.event === 'media') {
          const audioBuffer = Buffer.from(msg.media.payload, 'base64');
          // audioChunks.push(audioBuffer); // Commented out unused buffer
          const track = msg.media.track || 'inbound';
          plivoService.transcribeAudio(audioBuffer, callId, track).catch((transcribeError) => {
            console.error('[BACKEND] transcribeAudio failed:', transcribeError);
            sendTargeted(callId, {
              type: 'transcription_error',
              callId,
              error: transcribeError.message
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
        sendTargeted(callId.toString(), {
          type: 'call_disconnected',
          callId,
          timestamp: new Date().toISOString()
        });
      }
    });

    ws.on('error', (err) => {
      console.error('WS Error:', err);
    });
  });
};
