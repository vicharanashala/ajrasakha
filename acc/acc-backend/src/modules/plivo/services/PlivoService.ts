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

/**
 * Per-track streaming session. We now run TWO parallel Sarvam WebSocket
 * connections fed the exact same audio:
 *  - transcribeWsSession: mode=transcribe -> original-language transcript
 *  - translateWsSession:  mode=translate  -> English translation, produced
 *    directly from audio by Sarvam (not by re-translating fragmented ASR text)
 *
 * This removes the old REST POST /translate hop, which was translating
 * partial/disjointed text deltas out of context and producing poor results.
 */
interface SarvamStreamSession {
  transcribeWsSession: WsSession;
  translateWsSession: WsSession;
  onTranscript: (result: {
    track: 'inbound' | 'outbound';
    originalText: string;
    translatedText: string;
    detectedLanguage: string;
  }) => void;

  // original-language transcript state
  lastOriginal: string;
  pendingOriginal: string;
  originalDebounceTimer: NodeJS.Timeout | null;

  // English translation state (independent stream/segmentation)
  lastTranslated: string;
  pendingTranslated: string;
  translateDebounceTimer: NodeJS.Timeout | null;

  detectedLanguage: string;
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
  private callMetadataMap: Map<string, { from?: string; to?: string; agentUserId?: string; direction?: 'inbound' | 'outbound'; startTime?: Date }> = new Map();

  private lastActivityMap: Map<string, number> = new Map();
  private endedCalls: Set<string> = new Set();

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
        this.callMetadataMap.delete(callId);
      }
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

  private buildTranscribeUrl(): string {
    return `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=transcribe&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_l16&high_vad_sensitivity=true`;
  }

  private buildTranslateUrl(): string {
    // Same saaras:v3 endpoint, mode=translate -> Sarvam translates directly
    // from audio to English over the socket. This is the streaming
    // replacement for the old REST /translate call.
    return `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=translate&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_l16&high_vad_sensitivity=true`;
  }

  private makeWsSession(url: string): WsSession {
    const headers = { 'Api-Subscription-Key': this.sarvamApiKey };
    const ws = new WebSocket(url, { headers });
    return { ws, queue: [], isOpen: false };
  }

  private initializeTrackStream(
    callId: string,
    track: 'inbound' | 'outbound',
    onTranscript: (result: { track: 'inbound' | 'outbound'; originalText: string; translatedText: string; detectedLanguage: string }) => void
  ): void {
    const key = `${callId}_${track}`;
    console.log(`🔌 [PLIVO-SERVICE] Initializing Sarvam STT + Translate WSS streams for call ${callId} (${track})`);

    const transcribeWsSession = this.makeWsSession(this.buildTranscribeUrl());
    const translateWsSession = this.makeWsSession(this.buildTranslateUrl());

    const session: SarvamStreamSession = {
      transcribeWsSession,
      translateWsSession,
      onTranscript,
      lastOriginal: '',
      pendingOriginal: '',
      originalDebounceTimer: null,
      lastTranslated: '',
      pendingTranslated: '',
      translateDebounceTimer: null,
      detectedLanguage: 'unknown',
    };

    this.activeStreams.set(key, session);

    this.wireTranscribeSocket(callId, track, session);
    this.wireTranslateSocket(callId, track, session);
  }

  private wireTranscribeSocket(callId: string, track: 'inbound' | 'outbound', session: SarvamStreamSession): void {
    const key = `${callId}_${track}`;
    const wsSession = session.transcribeWsSession;
    const ws = wsSession.ws;

    ws.on('open', () => {
      wsSession.isOpen = true;
      this.flushQueue(wsSession);
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'data') {
          const current = (response.data.transcript || '').trim();
          if (!current) return;

          if (response.data.language_code) {
            session.detectedLanguage = response.data.language_code;
            this.detectedLanguages.set(key, response.data.language_code);
          }

          const delta = this.computeDelta(session.lastOriginal, current);
          if (delta) {
            session.lastOriginal = current;
            session.pendingOriginal = session.pendingOriginal ? `${session.pendingOriginal} ${delta}`.trim() : delta;
            this.triggerOriginalDebounce(callId, track);
          }
        } else if (response.type === 'error') {
          console.error(`❌ [PLIVO-SERVICE] Transcribe WS error response for call ${callId} (${track}):`, response.data);
        }
      } catch (err) {
        console.error(`❌ [PLIVO-SERVICE] Error parsing transcribe WS message for call ${callId} (${track}):`, err);
      }
    });

    ws.on('error', (err) => {
      console.error(`❌ [PLIVO-SERVICE] Transcribe WS socket error for call ${callId} (${track}):`, err);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 [PLIVO-SERVICE] Transcribe WS closed for call ${callId} (${track}). Code: ${code}, Reason: ${reason}`);
      wsSession.isOpen = false;
      if (this.activeStreams.has(key)) {
        console.warn(`[PLIVO-SERVICE] Reconnecting Sarvam transcribe WS for ${key}...`);
        setTimeout(() => {
          if (this.activeStreams.has(key)) {
            this.reconnectSocket(callId, track, 'transcribe');
          }
        }, 2000);
      }
    });
  }

  private wireTranslateSocket(callId: string, track: 'inbound' | 'outbound', session: SarvamStreamSession): void {
    const key = `${callId}_${track}`;
    const wsSession = session.translateWsSession;
    const ws = wsSession.ws;

    ws.on('open', () => {
      wsSession.isOpen = true;
      this.flushQueue(wsSession);
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'data') {
          // In mode=translate, `transcript` is already the English translation.
          const current = (response.data.transcript || '').trim();
          if (!current) return;

          const delta = this.computeDelta(session.lastTranslated, current);
          if (delta) {
            session.lastTranslated = current;
            session.pendingTranslated = session.pendingTranslated ? `${session.pendingTranslated} ${delta}`.trim() : delta;
            this.triggerTranslatedDebounce(callId, track);
          }
        } else if (response.type === 'error') {
          console.error(`❌ [PLIVO-SERVICE] Translate WS error response for call ${callId} (${track}):`, response.data);
        }
      } catch (err) {
        console.error(`❌ [PLIVO-SERVICE] Error parsing translate WS message for call ${callId} (${track}):`, err);
      }
    });

    ws.on('error', (err) => {
      console.error(`❌ [PLIVO-SERVICE] Translate WS socket error for call ${callId} (${track}):`, err);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 [PLIVO-SERVICE] Translate WS closed for call ${callId} (${track}). Code: ${code}, Reason: ${reason}`);
      wsSession.isOpen = false;
      if (this.activeStreams.has(key)) {
        console.warn(`[PLIVO-SERVICE] Reconnecting Sarvam translate WS for ${key}...`);
        setTimeout(() => {
          if (this.activeStreams.has(key)) {
            this.reconnectSocket(callId, track, 'translate');
          }
        }, 2000);
      }
    });
  }

  /** Shared delta logic: handles both growing hypotheses and revised hypotheses. */
  private computeDelta(prev: string, current: string): string {
    if (!prev) return current;
    if (current.startsWith(prev)) {
      return current.substring(prev.length).trim();
    }
    // Streaming hypothesis was revised by Sarvam: treat the whole thing as new content.
    return current;
  }

  private reconnectSocket(callId: string, track: 'inbound' | 'outbound', which: 'transcribe' | 'translate'): void {
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (!session) return;

    const url = which === 'transcribe' ? this.buildTranscribeUrl() : this.buildTranslateUrl();
    const newWsSession = this.makeWsSession(url);

    if (which === 'transcribe') {
      session.transcribeWsSession = newWsSession;
      // Reset hypothesis tracking so we don't diff against a stale value from the dropped socket.
      session.lastOriginal = '';
      this.wireTranscribeSocket(callId, track, session);
    } else {
      session.translateWsSession = newWsSession;
      session.lastTranslated = '';
      this.wireTranslateSocket(callId, track, session);
    }
    console.log(`[PLIVO-SERVICE] Reconnected Sarvam ${which} WS for ${key}`);
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

  private triggerOriginalDebounce(callId: string, track: 'inbound' | 'outbound'): void {
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (!session) return;

    if (session.originalDebounceTimer) {
      clearTimeout(session.originalDebounceTimer);
    }

    session.originalDebounceTimer = setTimeout(() => {
      const originalText = session.pendingOriginal.trim();
      session.pendingOriginal = '';
      session.originalDebounceTimer = null;

      if (originalText) {
        const currentOrig = this.activeTranscriptions.get(key) || '';
        this.activeTranscriptions.set(key, (currentOrig + ' ' + originalText).trim());
        this.emitTranscriptUpdate(callId, track, session, { originalText });
      }
    }, 1000);
  }

  private triggerTranslatedDebounce(callId: string, track: 'inbound' | 'outbound'): void {
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (!session) return;

    if (session.translateDebounceTimer) {
      clearTimeout(session.translateDebounceTimer);
    }

    session.translateDebounceTimer = setTimeout(() => {
      const translatedText = session.pendingTranslated.trim();
      session.pendingTranslated = '';
      session.translateDebounceTimer = null;

      if (translatedText) {
        const currentTrans = this.activeTranslations.get(key) || '';
        this.activeTranslations.set(key, (currentTrans + ' ' + translatedText).trim());
        this.emitTranscriptUpdate(callId, track, session, { translatedText });
      }
    }, 1000);
  }

  /**
   * The transcribe and translate sockets segment audio independently, so their
   * results don't arrive in lockstep. We emit an update as soon as *either*
   * side has new text, leaving the other field empty for that event.
   * Consumers of onTranscript should treat originalText/translatedText as
   * independent partial updates and only append the non-empty field(s),
   * rather than assuming both are always populated together.
   */
  private emitTranscriptUpdate(
    callId: string,
    track: 'inbound' | 'outbound',
    session: SarvamStreamSession,
    partial: { originalText?: string; translatedText?: string }
  ): void {
    const isOutbound = this.callMetadataMap.get(callId)?.direction === 'outbound';
    const mappedTrack: 'inbound' | 'outbound' = isOutbound ? (track === 'inbound' ? 'outbound' : 'inbound') : track;

    session.onTranscript({
      track: mappedTrack,
      originalText: partial.originalText || '',
      translatedText: partial.translatedText || '',
      detectedLanguage: session.detectedLanguage,
    });
  }

  async finalizeTrackStream(callId: string, track: 'inbound' | 'outbound'): Promise<{ originalText: string; translatedText: string }> {
    const key = `${callId}_${track}`;
    const session = this.activeStreams.get(key);
    if (!session) return { originalText: '', translatedText: '' };

    const flushMsg = JSON.stringify({ type: 'flush' });
    for (const wsSession of [session.transcribeWsSession, session.translateWsSession]) {
      try {
        if (wsSession.isOpen && wsSession.ws.readyState === WebSocket.OPEN) {
          wsSession.ws.send(flushMsg);
        }
      } catch (err) {
        console.error(`Error sending flush signal for ${track}:`, err);
      }
    }

    // Give Sarvam time to flush + emit final segments for both sockets.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (session.originalDebounceTimer) {
      clearTimeout(session.originalDebounceTimer);
      session.originalDebounceTimer = null;
    }
    if (session.translateDebounceTimer) {
      clearTimeout(session.translateDebounceTimer);
      session.translateDebounceTimer = null;
    }

    const remainingOriginal = session.pendingOriginal.trim();
    session.pendingOriginal = '';
    const remainingTranslated = session.pendingTranslated.trim();
    session.pendingTranslated = '';

    if (remainingOriginal) {
      const currentOrig = this.activeTranscriptions.get(key) || '';
      this.activeTranscriptions.set(key, (currentOrig + ' ' + remainingOriginal).trim());
    }
    if (remainingTranslated) {
      const currentTrans = this.activeTranslations.get(key) || '';
      this.activeTranslations.set(key, (currentTrans + ' ' + remainingTranslated).trim());
    }

    for (const wsSession of [session.transcribeWsSession, session.translateWsSession]) {
      try {
        if (wsSession.ws.readyState !== WebSocket.CLOSED) {
          wsSession.ws.close();
        }
      } catch (e) {
        console.error(`Error closing Sarvam WebSocket for ${track}:`, e);
      }
    }

    this.activeStreams.delete(key);

    return {
      originalText: remainingOriginal,
      translatedText: remainingTranslated,
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
    this.lastActivityMap.delete(callId);
    this.endedCalls.delete(callId);
    for (const track of ['inbound', 'outbound'] as const) {
      const key = `${callId}_${track}`;
      this.activeTranscriptions.delete(key);
      this.activeTranslations.delete(key);
      this.detectedLanguages.delete(key);

      const session = this.activeStreams.get(key);
      if (session) {
        if (session.originalDebounceTimer) clearTimeout(session.originalDebounceTimer);
        if (session.translateDebounceTimer) clearTimeout(session.translateDebounceTimer);
        for (const wsSession of [session.transcribeWsSession, session.translateWsSession]) {
          try {
            if (wsSession.ws.readyState !== WebSocket.CLOSED) {
              wsSession.ws.close();
            }
          } catch (e) {
            // ignore
          }
        }
        this.activeStreams.delete(key);
      }
    }
    this.callAgentMapping.delete(callId);
  }

  registerCall(callUuid: string, info: { from?: string; to?: string; agentUserId?: string; direction?: 'inbound' | 'outbound'; startTime?: Date }): void {
    const existing = this.callMetadataMap.get(callUuid) || {};
    this.callMetadataMap.set(callUuid, {
      ...existing,
      ...info,
      startTime: info.startTime || existing.startTime || new Date(),
    });
    if (info.agentUserId) {
      this.callAgentMapping.set(callUuid, info.agentUserId);
    }
    console.log(`📞 [PLIVO-SERVICE] Registered call metadata for ${callUuid}: from=${info.from}, to=${info.to}, direction=${info.direction || 'inbound'}, agent=${info.agentUserId}`);
  }

  getCallMetadata(callUuid: string): { from?: string; to?: string; agentUserId?: string; direction?: 'inbound' | 'outbound'; startTime?: Date } | undefined {
    return this.callMetadataMap.get(callUuid);
  }

  setCallAgent(callUuid: string, agentUserId: string): void {
    this.callAgentMapping.set(callUuid, agentUserId);
    const existing = this.callMetadataMap.get(callUuid) || {};
    this.callMetadataMap.set(callUuid, { ...existing, agentUserId });
    console.log(`✅ [PLIVO-SERVICE] Set agent ${agentUserId} for call ${callUuid}`);
  }

  getCallAgent(callUuid: string): string | undefined {
    return this.callAgentMapping.get(callUuid) || this.callMetadataMap.get(callUuid)?.agentUserId;
  }

  getCallDirection(callUuid: string): 'inbound' | 'outbound' {
    return this.callMetadataMap.get(callUuid)?.direction || 'inbound';
  }

  async saveCallDetails(callUuid: string): Promise<void> {
    try {
      const inMemoryMeta = this.callMetadataMap.get(callUuid);
      let plivoCall: any = null;
      try {
        plivoCall = await this.plivoClient.calls.get(callUuid);
      } catch (e) {
        console.warn(`⚠️ [PLIVO-SERVICE] Could not fetch Plivo details for ${callUuid}:`, e);
      }

      const isOutbound = (inMemoryMeta?.direction || plivoCall?.callDirection || plivoCall?.direction) === 'outbound';

      // Inbound: caller = inbound (Farmer), agent = outbound (Agent)
      // Outbound: caller = outbound (Farmer), agent = inbound (Agent)
      const callerTrack = isOutbound ? 'outbound' : 'inbound';
      const agentTrack = isOutbound ? 'inbound' : 'outbound';

      const callerTranscript = this.getTranscript(callUuid, callerTrack);
      const callerTranslation = this.getTranslation(callUuid, callerTrack);
      const callerLanguage = this.getDetectedLanguage(callUuid, callerTrack);

      const agentTranscript = this.getTranscript(callUuid, agentTrack);
      const agentTranslation = this.getTranslation(callUuid, agentTrack);
      const agentLanguage = this.getDetectedLanguage(callUuid, agentTrack);
      const rawAgentUserId = this.getCallAgent(callUuid) || inMemoryMeta?.agentUserId;
      let agentUserIdObj: ObjectId | undefined = undefined;
      if (rawAgentUserId) {
        const idStr = String(rawAgentUserId);
        if (ObjectId.isValid(idStr) && idStr.length === 24) {
          try {
            agentUserIdObj = new ObjectId(idStr);
          } catch {
            agentUserIdObj = undefined;
          }
        }
      }

      const myPlivoNumber = appConfig.plivo.plivo_number;
      const fromNumber = isOutbound
        ? (myPlivoNumber || inMemoryMeta?.from)
        : (plivoCall?.from || plivoCall?.fromNumber || plivoCall?.from_number || inMemoryMeta?.from);
      const toNumber = isOutbound
        ? (inMemoryMeta?.to || plivoCall?.to || plivoCall?.toNumber || plivoCall?.to_number)
        : (plivoCall?.to || plivoCall?.toNumber || plivoCall?.to_number || inMemoryMeta?.to);

      let duration = plivoCall?.duration || plivoCall?.callDuration || plivoCall?.totalDuration;
      if (duration !== undefined && duration !== null) {
        duration = Math.max(0, Math.round(Number(duration)));
      } else if (inMemoryMeta?.startTime) {
        duration = Math.max(0, Math.round((Date.now() - inMemoryMeta.startTime.getTime()) / 1000));
      }

      const status = plivoCall?.callState || plivoCall?.status || 'completed';
      const direction = isOutbound ? 'outbound' : (plivoCall?.callDirection || plivoCall?.direction || 'inbound');

      const callDetails = {
        callUuid,
        from: fromNumber,
        to: toNumber,
        duration: duration || 0,
        status: status,
        direction: direction,
        caller: {
          transcript: callerTranscript,
          translation: callerTranslation,
          detectedLanguage: callerLanguage,
        },
        agent: {
          transcript: agentTranscript,
          translation: agentTranslation,
          detectedLanguage: agentLanguage,
          userid: agentUserIdObj,
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