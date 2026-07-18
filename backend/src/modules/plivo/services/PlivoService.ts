import { inject, injectable } from 'inversify';
import { appConfig } from '../../../config/app.js';
import { WebSocket } from 'ws';
import plivo from 'plivo';
import { PLIVO_TYPES } from '../types.js';
import type { ICallDetailsRepository } from '#root/shared/database/interfaces/ICallDetailsRepository.js';

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

@injectable()
export class PlivoService {
  private sarvamApiKey: string;
  private activeTranscriptions: Map<string, string> = new Map();
  private activeTranslations: Map<string, string> = new Map(); // Store English translations
  private detectedLanguages: Map<string, string> = new Map(); // Store detected languages
  private activeStreams: Map<string, SarvamStreamSession> = new Map();
  private plivoClient: plivo.Client;

  constructor(
    @inject(PLIVO_TYPES.CallDetailsRepository)
    private readonly callDetailsRepository: ICallDetailsRepository
  ) {
    this.sarvamApiKey = appConfig.sarvamAPI;
    this.ensureDebugDir();
    this.plivoClient = new plivo.Client(
      process.env.PLIVO_AUTH_ID || 'MAMAZINGDUMMYAUTHID',
      process.env.PLIVO_AUTH_TOKEN || 'dummytoken',
      { timeout: 30000 }
    );
  }

  private ensureDebugDir(): void {
    // if (!fs.existsSync(this.DEBUG_AUDIO_DIR)) {
    //   fs.mkdirSync(this.DEBUG_AUDIO_DIR, { recursive: true });
    //   console.log(`📁 [PLIVO-SERVICE] Created debug audio directory: ${this.DEBUG_AUDIO_DIR}`);
    // }
  }

  /**
   * Initialize Sarvam WebSocket streams for a call
   */
  initializeStreams(
    callId: string,
    onTranscript: (result: { track: 'inbound' | 'outbound'; originalText: string; translatedText: string; detectedLanguage: string }) => void
  ): void {
    // console.log(`🔌 [PLIVO-SERVICE] Initializing Sarvam WebSocket streams for call ${callId}`);
    this.initializeTrackStream(callId, 'inbound', onTranscript);
    this.initializeTrackStream(callId, 'outbound', onTranscript);
  }

  /**
   * Initialize Sarvam WebSocket streams for a specific track (inbound/outbound)
   */
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

    // Set up transcribeWs listeners
    transcribeWs.on('open', () => {
      // console.log(`📡 [PLIVO-SERVICE] Transcribe WS opened for call ${callId} (${track})`);
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

    // Set up translateWs listeners
    translateWs.on('open', () => {
      // console.log(`📡 [PLIVO-SERVICE] Translate WS opened for call ${callId} (${track})`);
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
        // Update accumulated transcripts
        if (originalText) {
          const current = this.activeTranscriptions.get(key) || '';
          this.activeTranscriptions.set(key, (current + ' ' + originalText).trim());
        }
        // Only fall back to originalText if the text is English/ASCII
        const isEnglish = (session.detectedLanguage && session.detectedLanguage.startsWith('en')) ||
          /^[\x00-\x7F]*$/.test(originalText);

        const finalTranslatedText = translatedText || (isEnglish ? originalText : '');

        if (finalTranslatedText) {
          const current = this.activeTranslations.get(key) || '';
          this.activeTranslations.set(key, (current + ' ' + finalTranslatedText).trim());
        }

        // Trigger callback
        session.onTranscript({
          track,
          originalText,
          translatedText: finalTranslatedText,
          detectedLanguage: session.detectedLanguage,
        });

        // Reset pending buffers
        session.pendingOriginal = '';
        session.pendingTranslate = '';
      }
      session.debounceTimer = null;
    }, 1000);
  }

  /**
   * Finalize a specific track stream, flush pending transcriptions, and close connections
   */
  async finalizeTrackStream(callId: string, track: 'inbound' | 'outbound'): Promise<{ originalText: string; translatedText: string }> {
    const key = `${callId}_${track}`;
    // console.log(`🔌 [PLIVO-SERVICE] Finalizing stream for call ${callId} (${track})`);
    const session = this.activeStreams.get(key);
    if (!session) return { originalText: '', translatedText: '' };

    // Send flush signal to both sockets
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

    // Wait a brief period for any final messages to arrive and get processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
      session.debounceTimer = null;
    }

    // Capture any remaining pending text
    const originalText = session.pendingOriginal.trim();
    const translatedText = session.pendingTranslate.trim();

    // Close sockets
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

    // Remove from active streams
    this.activeStreams.delete(key);

    // Also update accumulated transcripts one last time
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

  /**
   * Finalize streams (fallback for backward compatibility)
   */
  async finalizeStreams(callId: string): Promise<{ originalText: string; translatedText: string }> {
    const res = await this.processRemainingAudio(callId);
    return res.inbound;
  }

  /**
   * Forward audio chunk to active streams
   */
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

  /**
   * Get complete transcript for a call track
   */
  getTranscript(callId: string, track: 'inbound' | 'outbound' = 'inbound'): string {
    const key = `${callId}_${track}`;
    return this.activeTranscriptions.get(key) || '';
  }

  /**
   * Get English translation for a call track
   */
  getTranslation(callId: string, track: 'inbound' | 'outbound' = 'inbound'): string {
    const key = `${callId}_${track}`;
    return this.activeTranslations.get(key) || '';
  }

  /**
   * Get detected language for a call track
   */
  getDetectedLanguage(callId: string, track: 'inbound' | 'outbound' = 'inbound'): string {
    const key = `${callId}_${track}`;
    return this.detectedLanguages.get(key) || 'unknown';
  }

  /**
   * Clear transcript and audio buffers for a call
   */
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
  }

  /**
   * Save complete call details into the database
   */
  async saveCallDetails(callUuid: string): Promise<void> {
    // console.log('saved call details', callUuid);
    try {
      // 1. Fetch from Plivo API
      let plivoCall: any = null;
      try {
        plivoCall = await this.plivoClient.calls.get(callUuid);
      } catch (e) {
        console.warn(`⚠️ [PLIVO-SERVICE] Could not fetch Plivo details for ${callUuid}:`, e);
      }

      // 2. Build participant objects using current transcripts
      const callerTranscript = this.getTranscript(callUuid, 'inbound');
      const callerTranslation = this.getTranslation(callUuid, 'inbound');
      const callerLanguage = this.getDetectedLanguage(callUuid, 'inbound');

      const agentTranscript = this.getTranscript(callUuid, 'outbound');
      const agentTranslation = this.getTranslation(callUuid, 'outbound');
      const agentLanguage = this.getDetectedLanguage(callUuid, 'outbound');

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
        }
      };

      // 3. Save to repository
      await this.callDetailsRepository.create(callDetails);
      console.log(`✅ [PLIVO-SERVICE] Saved call details for ${callUuid} to database.`);
    } catch (err) {
      console.error(`❌ [PLIVO-SERVICE] Error saving call details for ${callUuid}:`, err);
    }
  }

  /**
   * Process any remaining audio chunks when call ends
   */
  async processRemainingAudio(callId: string): Promise<{
    inbound: { originalText: string; translatedText: string };
    outbound: { originalText: string; translatedText: string };
  }> {
    const inbound = await this.finalizeTrackStream(callId, 'inbound');
    const outbound = await this.finalizeTrackStream(callId, 'outbound');
    return { inbound, outbound };
  }
}
