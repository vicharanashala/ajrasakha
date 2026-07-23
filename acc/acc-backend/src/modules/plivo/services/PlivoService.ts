import { inject, injectable } from 'inversify';
import { appConfig } from '../../../config/app.js';
import { WebSocket } from 'ws';
import plivo from 'plivo';
import { ObjectId } from 'mongodb';
import { PLIVO_TYPES } from '../types.js';
import type { ICallDetailsRepository } from '#shared/database/interfaces/ICallDetailsRepository.js';

interface WsSession {
  ws: WebSocket;
  queue: Buffer[];
  isOpen: boolean;
}

interface SarvamStreamSession {
  transcribeWsSession: WsSession;
  translateWsSession: WsSession;
  onTranscript: (result: {
    track: 'inbound' | 'outbound';
    originalText: string;
    translatedText: string;
    detectedLanguage: string;
  }) => void;
  lastOriginal: string;
  lastTranslate: string;
  detectedLanguage: string;
  pendingOriginal: string;
  pendingTranslate: string;
  debounceTimer: NodeJS.Timeout | null;
}

export interface ActiveCallInfo {
  callId: string;
  agentUserId?: string;
  agentName?: string;
  farmerNumber?: string;
  startTime: string;
  status: 'active' | 'ended';
}

@injectable()
export class PlivoService {
  private sarvamApiKey: string;
  private activeTranscriptions: Map<string, string> = new Map();
  private activeTranslations: Map<string, string> = new Map();
  private detectedLanguages: Map<string, string> = new Map();
  private activeStreams: Map<string, SarvamStreamSession> = new Map();
  private plivoClient: plivo.Client;
  private callAgentMapping: Map<string, string> = new Map();
  private activeCallsMap: Map<string, ActiveCallInfo> = new Map();

  constructor(
    @inject(PLIVO_TYPES.CallDetailsRepository)
    private readonly callDetailsRepository: ICallDetailsRepository
  ) {
    this.sarvamApiKey = appConfig.sarvamAPI;
    this.plivoClient = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN, { timeout: 30000 });
  }

  initializeStreams(
    callId: string,
    onTranscript: (result: { track: 'inbound' | 'outbound'; originalText: string; translatedText: string; detectedLanguage: string }) => void
  ): void {
    this.initializeTrackStream(callId, 'inbound', onTranscript);
    this.initializeTrackStream(callId, 'outbound', onTranscript);
  }

  private initializeTrackStream(
    callId: string,
    track: 'inbound' | 'outbound',
    onTranscript: (result: { track: 'inbound' | 'outbound'; originalText: string; translatedText: string; detectedLanguage: string }) => void
  ): void {
    const key = `${callId}_${track}`;
    console.log(`🔌 [PLIVO-SERVICE] Initializing Sarvam WebSocket streams for call ${callId} (${track})`);

    const transcribeUrl = `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=transcribe&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_l16&high_vad_sensitivity=true`;
    const translateUrl = `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=translate&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_l16&high_vad_sensitivity=true`;

    const headers = {
      'Api-Subscription-Key': this.sarvamApiKey,
    };

    const transcribeWs = new WebSocket(transcribeUrl, { headers });
    const translateWs = new WebSocket(translateUrl, { headers });

    const transcribeWsSession: WsSession = {
      ws: transcribeWs,
      queue: [],
      isOpen: false,
    };

    const translateWsSession: WsSession = {
      ws: translateWs,
      queue: [],
      isOpen: false,
    };

    const session: SarvamStreamSession = {
      transcribeWsSession,
      translateWsSession,
      onTranscript,
      lastOriginal: '',
      lastTranslate: '',
      detectedLanguage: 'unknown',
      pendingOriginal: '',
      pendingTranslate: '',
      debounceTimer: null,
    };

    this.activeStreams.set(key, session);

    transcribeWs.on('open', () => {
      transcribeWsSession.isOpen = true;
      this.flushQueue(transcribeWsSession);
    });

    transcribeWs.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'data') {
          const current = response.data.transcript || '';
          const prev = session.lastOriginal;
          let delta = '';
          if (current.startsWith(prev)) {
            delta = current.substring(prev.length).trim();
          } else {
            delta = current.trim();
          }

          if (response.data.language_code) {
            session.detectedLanguage = response.data.language_code;
            this.detectedLanguages.set(key, response.data.language_code);
          }

          if (delta) {
            session.lastOriginal = current;
            session.pendingOriginal = (session.pendingOriginal + ' ' + delta).trim();
            this.triggerDebounce(callId, track);
          }
        } else if (response.type === 'error') {
          console.error(`❌ [PLIVO-SERVICE] Transcribe WS error response for call ${callId} (${track}):`, response.data);
        }
      } catch (err) {
        console.error(`❌ [PLIVO-SERVICE] Error parsing transcribe WS message for call ${callId} (${track}):`, err);
      }
    });

    transcribeWs.on('error', (err) => {
      console.error(`❌ [PLIVO-SERVICE] Transcribe WS socket error for call ${callId} (${track}):`, err);
    });

    transcribeWs.on('close', (code, reason) => {
      console.log(`🔌 [PLIVO-SERVICE] Transcribe WS closed for call ${callId} (${track}). Code: ${code}, Reason: ${reason}`);
    });

    translateWs.on('open', () => {
      translateWsSession.isOpen = true;
      this.flushQueue(translateWsSession);
    });

    translateWs.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'data') {
          const current = response.data.transcript || '';
          const prev = session.lastTranslate;
          let delta = '';
          if (current.startsWith(prev)) {
            delta = current.substring(prev.length).trim();
          } else {
            delta = current.trim();
          }

          if (delta) {
            session.lastTranslate = current;
            session.pendingTranslate = (session.pendingTranslate + ' ' + delta).trim();
            this.triggerDebounce(callId, track);
          }
        } else if (response.type === 'error') {
          console.error(`❌ [PLIVO-SERVICE] Translate WS error response for call ${callId} (${track}):`, response.data);
        }
      } catch (err) {
        console.error(`❌ [PLIVO-SERVICE] Error parsing translate WS message for call ${callId} (${track}):`, err);
      }
    });

    translateWs.on('error', (err) => {
      console.error(`❌ [PLIVO-SERVICE] Translate WS socket error for call ${callId} (${track}):`, err);
    });

    translateWs.on('close', (code, reason) => {
      console.log(`🔌 [PLIVO-SERVICE] Translate WS closed for call ${callId} (${track}). Code: ${code}, Reason: ${reason}`);
    });
  }

  private flushQueue(wsSession: WsSession): void {
    while (wsSession.queue.length > 0) {
      const chunk = wsSession.queue.shift();
      if (chunk) {
        this.sendAudio(wsSession, chunk);
      }
    }
  }

  private sendAudio(wsSession: WsSession, audioBuffer: Buffer): void {
    if (wsSession.isOpen && wsSession.ws.readyState === WebSocket.OPEN) {
      try {
        const base64Data = audioBuffer.toString('base64');
        const msg = JSON.stringify({
          audio: {
            data: base64Data,
            sample_rate: '16000',
            encoding: 'audio/wav',
          },
        });
        wsSession.ws.send(msg);
      } catch (err) {
        console.error('❌ [PLIVO-SERVICE] Error sending audio chunk over WS:', err);
      }
    } else {
      wsSession.queue.push(audioBuffer);
    }
  }

  private triggerDebounce(callId: string, track: 'inbound' | 'outbound'): void {
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (!session) return;

    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
    }

    session.debounceTimer = setTimeout(() => {
      const originalText = session.pendingOriginal.trim();
      const translatedText = session.pendingTranslate.trim();

      if (originalText || translatedText) {
        if (originalText) {
          const current = this.activeTranscriptions.get(key) || '';
          this.activeTranscriptions.set(key, (current + ' ' + originalText).trim());
        }
        const isEnglish = (session.detectedLanguage && session.detectedLanguage.startsWith('en')) ||
          /^[\x00-\x7F]*$/.test(originalText);

        const finalTranslatedText = translatedText || (isEnglish ? originalText : '');

        if (finalTranslatedText) {
          const current = this.activeTranslations.get(key) || '';
          this.activeTranslations.set(key, (current + ' ' + finalTranslatedText).trim());
        }

        session.onTranscript({
          track,
          originalText,
          translatedText: finalTranslatedText,
          detectedLanguage: session.detectedLanguage,
        });

        session.pendingOriginal = '';
        session.pendingTranslate = '';
      }
      session.debounceTimer = null;
    }, 1000);
  }

  async finalizeTrackStream(callId: string, track: 'inbound' | 'outbound'): Promise<{ originalText: string; translatedText: string }> {
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (!session) return { originalText: '', translatedText: '' };

    const flushMsg = JSON.stringify({ type: 'flush' });
    try {
      if (session.transcribeWsSession.isOpen && session.transcribeWsSession.ws.readyState === WebSocket.OPEN) {
        session.transcribeWsSession.ws.send(flushMsg);
      }
      if (session.translateWsSession.isOpen && session.translateWsSession.ws.readyState === WebSocket.OPEN) {
        session.translateWsSession.ws.send(flushMsg);
      }
    } catch (err) {
      console.error(`Error sending flush signal for ${track}:`, err);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
      session.debounceTimer = null;
    }

    const originalText = session.pendingOriginal.trim();
    const translatedText = session.pendingTranslate.trim();

    try {
      if (session.transcribeWsSession.ws.readyState !== WebSocket.CLOSED) {
        session.transcribeWsSession.ws.close();
      }
      if (session.translateWsSession.ws.readyState !== WebSocket.CLOSED) {
        session.translateWsSession.ws.close();
      }
    } catch (e) {
      console.error(`Error closing Sarvam WebSockets for ${track}:`, e);
    }

    this.activeStreams.delete(key);

    if (originalText) {
      const current = this.activeTranscriptions.get(key) || '';
      this.activeTranscriptions.set(key, (current + ' ' + originalText).trim());
    }
    if (translatedText) {
      const current = this.activeTranslations.get(key) || '';
      this.activeTranslations.set(key, (current + ' ' + translatedText).trim());
    }

    return { originalText, translatedText };
  }

  async finalizeStreams(callId: string): Promise<{ originalText: string; translatedText: string }> {
    const res = await this.processRemainingAudio(callId);
    return res.inbound;
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    callId: string,
    track: 'inbound' | 'outbound' = 'inbound'
  ): Promise<{ originalText: string; translatedText: string }> {
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (session) {
      this.sendAudio(session.transcribeWsSession, audioBuffer);
      this.sendAudio(session.translateWsSession, audioBuffer);
    }
    return { originalText: '', translatedText: '' };
  }

  getTranscript(callId: string, track: 'inbound' | 'outbound' = 'inbound'): string {
    const key = `${callId}_${track}`;
    return this.activeTranscriptions.get(key) || '';
  }

  getTranslation(callId: string, track: 'inbound' | 'outbound' = 'inbound'): string {
    const key = `${callId}_${track}`;
    return this.activeTranslations.get(key) || '';
  }

  getDetectedLanguage(callId: string, track: 'inbound' | 'outbound' = 'inbound'): string {
    const key = `${callId}_${track}`;
    return this.detectedLanguages.get(key) || 'unknown';
  }

  clearTranscript(callId: string): void {
    for (const track of ['inbound', 'outbound'] as const) {
      const key = `${callId}_${track}`;
      this.activeTranscriptions.delete(key);
      this.activeTranslations.delete(key);
      this.detectedLanguages.delete(key);

      const session = this.activeStreams.get(key);
      if (session) {
        if (session.debounceTimer) {
          clearTimeout(session.debounceTimer);
        }
        try {
          if (session.transcribeWsSession.ws.readyState !== WebSocket.CLOSED) {
            session.transcribeWsSession.ws.close();
          }
          if (session.translateWsSession.ws.readyState !== WebSocket.CLOSED) {
            session.translateWsSession.ws.close();
          }
        } catch (e) {
          // ignore
        }
        this.activeStreams.delete(key);
      }
    }
    this.callAgentMapping.delete(callId);
  }

  setCallAgent(callUuid: string, agentUserId: string): void {
    this.callAgentMapping.set(callUuid, agentUserId);
    console.log(`✅ [PLIVO-SERVICE] Set agent ${agentUserId} for call ${callUuid}`);
  }

  getCallAgent(callUuid: string): string | undefined {
    return this.callAgentMapping.get(callUuid);
  }

  async saveCallDetails(callUuid: string): Promise<void> {
    try {
      let plivoCall: any = null;
      try {
        plivoCall = await this.plivoClient.calls.get(callUuid);
      } catch (e) {
        console.warn(`⚠️ [PLIVO-SERVICE] Could not fetch Plivo details for ${callUuid}:`, e);
      }

      const callerTranscript = this.getTranscript(callUuid, 'inbound');
      const callerTranslation = this.getTranslation(callUuid, 'inbound');
      const callerLanguage = this.getDetectedLanguage(callUuid, 'inbound');

      const agentTranscript = this.getTranscript(callUuid, 'outbound');
      const agentTranslation = this.getTranslation(callUuid, 'outbound');
      const agentLanguage = this.getDetectedLanguage(callUuid, 'outbound');
      const agentUserId = this.getCallAgent(callUuid);

      const callDetails = {
        callUuid,
        from: plivoCall?.fromNumber,
        to: plivoCall?.toNumber,
        duration: plivoCall?.callDuration,
        status: plivoCall?.callState,
        direction: plivoCall?.callDirection,
        caller: {
          transcript: callerTranscript,
          translation: callerTranslation,
          detectedLanguage: callerLanguage,
        },
        agent: {
          transcript: agentTranscript,
          translation: agentTranslation,
          detectedLanguage: agentLanguage,
          userid: agentUserId ? new ObjectId(agentUserId) : undefined,
        }
      };

      const existingCall = await this.callDetailsRepository.getByCallUuid(callUuid);
      if (existingCall) {
        await this.callDetailsRepository.updateCallDetails(callUuid, callDetails);
        console.log(`✅ [PLIVO-SERVICE] Updated existing call details for ${callUuid} in database.`);
      } else {
        await this.callDetailsRepository.create(callDetails);
        console.log(`✅ [PLIVO-SERVICE] Saved new call details for ${callUuid} to database.`);
      }
    } catch (err) {
      console.error(`❌ [PLIVO-SERVICE] Error saving call details for ${callUuid}:`, err);
    }
  }

  async processRemainingAudio(callId: string): Promise<{
    inbound: { originalText: string; translatedText: string };
    outbound: { originalText: string; translatedText: string };
  }> {
    const inbound = await this.finalizeTrackStream(callId, 'inbound');
    const outbound = await this.finalizeTrackStream(callId, 'outbound');
    return { inbound, outbound };
  }

  registerActiveCall(callId: string, details?: Partial<ActiveCallInfo>): ActiveCallInfo {
    const existing = this.activeCallsMap.get(callId);
    const info: ActiveCallInfo = {
      callId,
      agentUserId: details?.agentUserId || existing?.agentUserId || this.callAgentMapping.get(callId),
      agentName: details?.agentName || existing?.agentName,
      farmerNumber: details?.farmerNumber || existing?.farmerNumber,
      startTime: details?.startTime || existing?.startTime || new Date().toISOString(),
      status: 'active',
    };
    this.activeCallsMap.set(callId, info);
    console.log(`📞 [PLIVO-SERVICE] Registered active call ${callId}`, info);
    return info;
  }

  removeActiveCall(callId: string): void {
    this.activeCallsMap.delete(callId);
    console.log(`📴 [PLIVO-SERVICE] Removed active call ${callId}`);
  }

  getActiveCalls(): ActiveCallInfo[] {
    return Array.from(this.activeCallsMap.values()).filter(c => c.status === 'active');
  }

  getActiveCall(callId: string): ActiveCallInfo | undefined {
    return this.activeCallsMap.get(callId);
  }
}
