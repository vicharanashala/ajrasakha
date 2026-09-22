// import fs from 'fs';
// import path from 'path';
import { inject, injectable } from 'inversify';
import { appConfig } from '../../../config/app.js';
import { aiConfig } from '../../../config/ai.js';
import { WebSocket } from 'ws';
import { SocksProxyAgent } from 'socks-proxy-agent';
import plivo from 'plivo';
import axios, { AxiosInstance } from 'axios';
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

  // SOCKS5 proxy agent for Tailscale network (localhost:1055)
  private readonly httpAgent = new SocksProxyAgent('socks5://localhost:1055');

  private createAxiosInstance(): AxiosInstance {
    return axios.create({
      httpAgent: this.httpAgent,
      httpsAgent: this.httpAgent,
    });
  }
  private sarvamApiKey: string;
  private readonly TIMEOUT = aiConfig.accAgentTimeout;
  private readonly translateApiUrl = /*aiConfig.accTranslateApiUrl*/"http://100.100.108.44:8110/v1/translate/to-english";
  private activeTranscriptions: Map<string, string> = new Map();
  private activeTranslations: Map<string, string> = new Map();
  private detectedLanguages: Map<string, string> = new Map();
  private activeStreams: Map<string, SarvamStreamSession> = new Map();
  private plivoClient: plivo.Client;
  private callAgentMapping: Map<string, string> = new Map();
  private callMetadataMap: Map<string, { from?: string; to?: string; agentUserId?: string; direction?: 'inbound' | 'outbound'; startTime?: Date }> = new Map();

  private lastActivityMap: Map<string, number> = new Map();
  // private audioDumpBuffers: Map<string, Buffer[]> = new Map();

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
    const maxRetentionMs = 30 * 60 * 1000; // 30 minutes TTL for call metadata

    // 1. Purge stale call metadata, agent mappings, and ended call markers
    for (const [uuid, meta] of this.callMetadataMap.entries()) {
      const callTime = meta.startTime ? meta.startTime.getTime() : 0;
      if (now - callTime > maxRetentionMs) {
        this.callMetadataMap.delete(uuid);
        this.callAgentMapping.delete(uuid);
        this.endedCalls.delete(uuid);
      }
    }

    // 2. Purge stale transcription/stream sessions older than 30 minutes
    for (const [callId, lastTime] of this.lastActivityMap.entries()) {
      if (now - lastTime > maxRetentionMs) {
        console.log(`[PLIVO-SERVICE GC] Purging stale in-memory call session for ${callId}`);
        this.clearTranscript(callId);
      }
    }
  }

  /*
  // Generates a standard 44-byte RIFF/WAV header for 16-bit linear PCM audio.
  private createWavHeader(dataLength: number, sampleRate = 16000, numChannels = 1, bitsPerSample = 16): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    // RIFF chunk descriptor
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);

    // "fmt " sub-chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // "data" sub-chunk
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return header;
  }

  // Saves accumulated raw PCM chunks for a call track into a single playable WAV file.
  saveAudioDump(callId: string, track: 'inbound' | 'outbound'): void {
    const key = `${callId}_${track}`;
    const chunks = this.audioDumpBuffers.get(key);
    if (!chunks || chunks.length === 0) {
      this.audioDumpBuffers.delete(key);
      return;
    }

    try {
      const dumpDir = path.resolve(process.cwd(), 'uploads', 'audio-dumps');
      if (!fs.existsSync(dumpDir)) {
        fs.mkdirSync(dumpDir, { recursive: true });
      }

      const pcmData = Buffer.concat(chunks);
      const wavHeader = this.createWavHeader(pcmData.length, 16000, 1, 16);
      const wavFile = Buffer.concat([wavHeader, pcmData]);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${callId}_${track}_${timestamp}.wav`;
      const filePath = path.join(dumpDir, filename);

      fs.writeFileSync(filePath, wavFile);
      const durationSec = (pcmData.length / 32000).toFixed(1);
      const sizeKB = (wavFile.length / 1024).toFixed(1);
      console.log(`💾 [PLIVO-SERVICE] Saved single audio dump for call ${callId} (${track}) to ${filePath} (${durationSec}s, ${sizeKB} KB)`);
    } catch (err) {
      console.error(`❌ [PLIVO-SERVICE] Failed to save audio dump for ${key}:`, err);
    } finally {
      this.audioDumpBuffers.delete(key);
    }
  }
  */

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
      // const response = await axios.post(
      //   'https://api.sarvam.ai/translate',
      //   {
      //     input: cleanText,
      //     source_language_code: sourceLangCode,
      //     target_language_code: 'en-IN',
      //     model: 'sarvam-translate:v1',
      //     mode: 'formal',
      //   },
      //   {
      //     headers: {
      //       'api-subscription-key': this.sarvamApiKey,
      //       'Content-Type': 'application/json',
      //     },
      //     timeout: 2500,
      //   }
      // );
      const api = this.createAxiosInstance();

      const response = await api.post(
        this.translateApiUrl,
        {
          text: cleanText,
          source_language: sourceLangCode,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.TIMEOUT,
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

    const transcribeUrl = `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=transcribe&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_l16&high_vad_sensitivity=false`;

    const headers = {
      'api-subscription-key': this.sarvamApiKey,
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
      // console.log(`✅ [PLIVO-SERVICE] Sarvam transcribe WS connected for ${key}`);
      transcribeWsSession.isOpen = true;
      this.flushQueue(transcribeWsSession);
    });

    transcribeWs.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'data') {
          const current = (response.data?.transcript || '').trim();
          // console.log(`📩 [PLIVO-SERVICE] Sarvam STT data for ${key}: "${current}" (lang=${response.data?.language_code || session.detectedLanguage})`);
          if (!current) return;

          if (response.data.language_code) {
            session.detectedLanguage = response.data.language_code;
            this.detectedLanguages.set(key, response.data.language_code);
          }

          const prev = session.lastOriginal;
          let delta = '';
          if (prev && current.startsWith(prev)) {
            delta = current.substring(prev.length).trim();
          } else {
            delta = current;
          }

          if (delta) {
            session.lastOriginal = current;
            session.pendingOriginal = session.pendingOriginal
              ? `${session.pendingOriginal} ${delta}`.trim()
              : delta;
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

    const url = `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v3&mode=transcribe&language-code=unknown&sample_rate=16000&input_audio_codec=pcm_l16&high_vad_sensitivity=false`;
    const headers = {
      'api-subscription-key': this.sarvamApiKey,
      'Api-Subscription-Key': this.sarvamApiKey,
    };
    const newWs = new WebSocket(url, { headers });

    const wsSession = session.transcribeWsSession;
    wsSession.ws = newWs;
    wsSession.isOpen = false;

    newWs.on('open', () => {
      wsSession.isOpen = true;
      this.flushQueue(wsSession);
      console.log(`✅ [PLIVO-SERVICE] Reconnected Sarvam transcribe WS for ${key}`);
    });

    newWs.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'data') {
          const current = (response.data?.transcript || '').trim();
          // console.log(`📩 [PLIVO-SERVICE] Reconnected Sarvam STT data for ${key}: "${current}"`);
          if (!current) return;

          if (response.data.language_code) {
            session.detectedLanguage = response.data.language_code;
            this.detectedLanguages.set(key, response.data.language_code);
          }

          const prev = session.lastOriginal;
          let delta = '';
          if (prev && current.startsWith(prev)) {
            delta = current.substring(prev.length).trim();
          } else {
            delta = current;
          }

          if (delta) {
            session.lastOriginal = current;
            session.pendingOriginal = session.pendingOriginal
              ? `${session.pendingOriginal} ${delta}`.trim()
              : delta;
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
            sample_rate: 16000,
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
      session.lastOriginal = '';

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

        const isOutbound = this.callMetadataMap.get(callId)?.direction === 'outbound';
        const mappedTrack: 'inbound' | 'outbound' = isOutbound ? (track === 'inbound' ? 'outbound' : 'inbound') : track;

        session.onTranscript({
          track: mappedTrack,
          originalText,
          translatedText: finalTranslatedText,
          detectedLanguage: session.detectedLanguage,
        });
      }
      session.debounceTimer = null;
    }, 1500);
  }

  async finalizeTrackStream(callId: string, track: 'inbound' | 'outbound'): Promise<{ originalText: string; translatedText: string }> {
    const key = `${callId}_${track}`;

    // Save single raw audio dump for this track
    // this.saveAudioDump(callId, track);

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
    session.lastOriginal = '';
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

    // Collect raw PCM chunk for call audio dump
    // let bufferList = this.audioDumpBuffers.get(key);
    // if (!bufferList) {
    //   bufferList = [];
    //   this.audioDumpBuffers.set(key, bufferList);
    // }
    // bufferList.push(audioBuffer);

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
    this.endedCalls.delete(callId);
    for (const track of ['inbound', 'outbound'] as const) {
      // Safety fallback to dump audio if not finalized prior
      // this.saveAudioDump(callId, track);

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


  registerCall(callUuid: string, info: { from?: string; to?: string; agentUserId?: string; direction?: 'inbound' | 'outbound'; startTime?: Date }): void {
    // Inline purge if memory map grows above 500 entries (TTL 30 minutes)
    if (this.callMetadataMap.size > 500) {
      const now = Date.now();
      const maxRetentionMs = 30 * 60 * 1000;
      for (const [uuid, meta] of this.callMetadataMap.entries()) {
        const callTime = meta.startTime ? meta.startTime.getTime() : 0;
        if (now - callTime > maxRetentionMs) {
          this.callMetadataMap.delete(uuid);
          this.callAgentMapping.delete(uuid);
          this.endedCalls.delete(uuid);
        }
      }
    }

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

  findParentCallUuid(phoneNumber?: string, agentUserId?: string): string | undefined {
    const now = Date.now();
    // Dialing times out in 40s. A 90s window is ample for incoming bridge connection.
    const maxWindowMs = 90 * 1000;
    const cleanTargetPhone = phoneNumber ? phoneNumber.replace(/[^\d]/g, '').slice(-10) : '';

    // Search newest-first to always correlate with the most recent call
    const entries = Array.from(this.callMetadataMap.entries()).reverse();

    // Priority 1: Exact match on BOTH phone number AND assigned agent (Highest confidence)
    if (cleanTargetPhone && agentUserId) {
      for (const [uuid, meta] of entries) {
        if (meta.direction && meta.direction !== 'inbound') continue;
        const startTimeMs = meta.startTime ? meta.startTime.getTime() : 0;
        if (now - startTimeMs > maxWindowMs) continue;

        const cleanFrom = meta.from ? meta.from.replace(/[^\d]/g, '').slice(-10) : '';
        if (cleanFrom === cleanTargetPhone && meta.agentUserId === agentUserId) {
          return uuid;
        }
      }
    }

    // Priority 2: Match on phone number alone (if caller phone is known)
    if (cleanTargetPhone) {
      for (const [uuid, meta] of entries) {
        if (meta.direction && meta.direction !== 'inbound') continue;
        const startTimeMs = meta.startTime ? meta.startTime.getTime() : 0;
        if (now - startTimeMs > maxWindowMs) continue;

        const cleanFrom = meta.from ? meta.from.replace(/[^\d]/g, '').slice(-10) : '';
        if (cleanFrom && (cleanFrom === cleanTargetPhone || cleanFrom.includes(cleanTargetPhone) || cleanTargetPhone.includes(cleanFrom))) {
          return uuid;
        }
      }
    }

    // Priority 3: Fallback match on agentUserId ONLY IF caller phone was NOT provided / unknown
    // AND the call was placed very recently (within 45s, during active ringing)
    if (!cleanTargetPhone && agentUserId) {
      for (const [uuid, meta] of entries) {
        if (meta.direction && meta.direction !== 'inbound') continue;
        const startTimeMs = meta.startTime ? meta.startTime.getTime() : 0;
        if (now - startTimeMs > 45 * 1000) continue;

        if (meta.agentUserId === agentUserId) {
          return uuid;
        }
      }
    }

    return undefined;
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

