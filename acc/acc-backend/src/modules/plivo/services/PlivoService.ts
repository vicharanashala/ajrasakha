import { inject, injectable } from 'inversify';
import { appConfig } from '../../../config/app.js';
import { WebSocket } from 'ws';
import plivo from 'plivo';
import axios from 'axios';
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
  onTranscript: (result: {
    track: 'inbound' | 'outbound';
    originalText: string;
    translatedText: string;
    detectedLanguage: string;
  }) => void;
  lastOriginal: string;
  detectedLanguage: string;
  pendingOriginal: string;
  debounceTimer: NodeJS.Timeout | null;
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

  private lastActivityMap: Map<string, number> = new Map();

  constructor(
    @inject(PLIVO_TYPES.CallDetailsRepository)
    private readonly callDetailsRepository: ICallDetailsRepository
  ) {
    this.sarvamApiKey = appConfig.sarvamAPI;
    this.plivoClient = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN, { timeout: 30000 });

    // Periodic GC sweep every 15 minutes to clear stale call sessions older than 1 hour
    setInterval(() => {
      this.cleanupStaleSessions();
    }, 15 * 60 * 1000);
  }

  cleanupStaleSessions(): void {
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;
    for (const [callId, lastTime] of this.lastActivityMap.entries()) {
      if (now - lastTime > oneHourMs) {
        console.log(`[PLIVO-SERVICE GC] Purging stale in-memory call session for ${callId}`);
        this.clearTranscript(callId);
      }
    }
  }

  /**
   * Fast text translation using Sarvam AI's sarvam-translate:v1 model.
   * Auto-detects English / ASCII and returns instantly (0ms).
   * Gracefully falls back to original text on timeout / error so stream never hangs.
   */
  async translateText(text: string, sourceLang?: string): Promise<string> {
    const cleanText = text.trim();
    if (!cleanText) return '';

    // Instant bypass for English / ASCII text (0ms)
    const isEnglish = (sourceLang && sourceLang.startsWith('en')) || /^[\x00-\x7F]*$/.test(cleanText);
    if (isEnglish) {
      return cleanText;
    }

    if (!this.sarvamApiKey) {
      return cleanText;
    }

    try {
      const sourceLangCode = sourceLang && sourceLang !== 'unknown' ? sourceLang : 'auto';
      const response = await axios.post(
        'https://api.sarvam.ai/translate',
        {
          input: cleanText,
          source_language_code: sourceLangCode,
          target_language_code: 'en-IN',
          model: 'sarvam-translate:v1',
          mode: 'formal',
        },
        {
          headers: {
            'api-subscription-key': this.sarvamApiKey,
            'Content-Type': 'application/json',
          },
          timeout: 2500,
        }
      );

      const translated = response.data?.translated_text?.trim();
      return translated || cleanText;
    } catch (err: any) {
      console.warn(`⚠️ [PLIVO-SERVICE] Translation API warning (${err.message}). Falling back to original text.`);
      return cleanText;
    }
  }

  initializeStreams(
    callId: string,
    onTranscript: (result: { track: 'inbound' | 'outbound'; originalText: string; translatedText: string; detectedLanguage: string }) => void
  ): void {
    this.lastActivityMap.set(callId, Date.now());
    this.initializeTrackStream(callId, 'inbound', onTranscript);
    this.initializeTrackStream(callId, 'outbound', onTranscript);
  }

  private initializeTrackStream(
    callId: string,
    track: 'inbound' | 'outbound',
    onTranscript: (result: { track: 'inbound' | 'outbound'; originalText: string; translatedText: string; detectedLanguage: string }) => void
  ): void {
    const key = `${callId}_${track}`;
    console.log(`🔌 [PLIVO-SERVICE] Initializing Sarvam STT WebSocket stream for call ${callId} (${track})`);

    const transcribeUrl = `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=transcribe&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_l16&high_vad_sensitivity=true`;

    const headers = {
      'Api-Subscription-Key': this.sarvamApiKey,
    };

    const transcribeWs = new WebSocket(transcribeUrl, { headers });

    const transcribeWsSession: WsSession = {
      ws: transcribeWs,
      queue: [],
      isOpen: false,
    };

    const session: SarvamStreamSession = {
      transcribeWsSession,
      onTranscript,
      lastOriginal: '',
      detectedLanguage: 'unknown',
      pendingOriginal: '',
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
      transcribeWsSession.isOpen = false;
      // Auto-reconnect if call stream session is still active
      if (this.activeStreams.has(key)) {
        console.warn(`[PLIVO-SERVICE] Reconnecting Sarvam transcribe WS for ${key}...`);
        setTimeout(() => {
          if (this.activeStreams.has(key)) {
            this.reconnectTrackWs(callId, track);
          }
        }, 2000);
      }
    });
  }

  private reconnectTrackWs(callId: string, track: 'inbound' | 'outbound'): void {
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (!session) return;

    const url = `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=transcribe&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_l16&high_vad_sensitivity=true`;
    const headers = { 'Api-Subscription-Key': this.sarvamApiKey };
    const newWs = new WebSocket(url, { headers });

    const wsSession = session.transcribeWsSession;
    wsSession.ws = newWs;
    wsSession.isOpen = false;

    newWs.on('open', () => {
      wsSession.isOpen = true;
      this.flushQueue(wsSession);
      console.log(`[PLIVO-SERVICE] Reconnected Sarvam transcribe WS for ${key}`);
    });

    newWs.on('message', (data) => {
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
        }
      } catch (err) {
        console.error(`[PLIVO-SERVICE] Error parsing reconnected transcribe WS message for ${key}:`, err);
      }
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

    session.debounceTimer = setTimeout(async () => {
      const originalText = session.pendingOriginal.trim();
      session.pendingOriginal = '';

      if (originalText) {
        // Accumulate original transcript
        const currentOrig = this.activeTranscriptions.get(key) || '';
        this.activeTranscriptions.set(key, (currentOrig + ' ' + originalText).trim());

        // Fast text translation using Sarvam sarvam-translate:v1
        const finalTranslatedText = await this.translateText(originalText, session.detectedLanguage);

        // Accumulate translated transcript
        if (finalTranslatedText) {
          const currentTrans = this.activeTranslations.get(key) || '';
          this.activeTranslations.set(key, (currentTrans + ' ' + finalTranslatedText).trim());
        }

        session.onTranscript({
          track,
          originalText,
          translatedText: finalTranslatedText,
          detectedLanguage: session.detectedLanguage,
        });
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
    } catch (err) {
      console.error(`Error sending flush signal for ${track}:`, err);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
      session.debounceTimer = null;
    }

    const remainingOriginal = session.pendingOriginal.trim();
    session.pendingOriginal = '';
    let remainingTranslated = '';

    if (remainingOriginal) {
      const currentOrig = this.activeTranscriptions.get(key) || '';
      this.activeTranscriptions.set(key, (currentOrig + ' ' + remainingOriginal).trim());

      remainingTranslated = await this.translateText(remainingOriginal, session.detectedLanguage);
      if (remainingTranslated) {
        const currentTrans = this.activeTranslations.get(key) || '';
        this.activeTranslations.set(key, (currentTrans + ' ' + remainingTranslated).trim());
      }
    }

    try {
      if (session.transcribeWsSession.ws.readyState !== WebSocket.CLOSED) {
        session.transcribeWsSession.ws.close();
      }
    } catch (e) {
      console.error(`Error closing Sarvam WebSocket for ${track}:`, e);
    }

    this.activeStreams.delete(key);

    return {
      originalText: remainingOriginal,
      translatedText: remainingTranslated
    };
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
    this.lastActivityMap.set(callId, Date.now());
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (session) {
      this.sendAudio(session.transcribeWsSession, audioBuffer);
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
    this.lastActivityMap.delete(callId);
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
    this.markCallEnded(callId);
    return { inbound, outbound };
  }

  private endedCalls: Set<string> = new Set();

  markCallEnded(callId: string): void {
    this.endedCalls.add(callId);
    console.log(`📞 [PLIVO-SERVICE] Marked call ${callId} as ended/hung up.`);
  }

  isCallActive(callId: string): boolean {
    if (this.endedCalls.has(callId)) {
      return false;
    }
    return this.activeStreams.has(`${callId}_inbound`) || this.activeStreams.has(`${callId}_outbound`);
  }

  isCallEnded(callId: string): boolean {
    return this.endedCalls.has(callId) || !this.isCallActive(callId);
  }
}

