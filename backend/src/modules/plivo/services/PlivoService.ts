import { injectable } from 'inversify';
import { appConfig } from '../../../config/app.js';
import { WebSocket } from 'ws';

interface WsSession {
  ws: WebSocket;
  queue: Buffer[];
  isOpen: boolean;
}

interface SarvamStreamSession {
  transcribeWsSession: WsSession;
  translateWsSession: WsSession;
  onTranscript: (result: {
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

  constructor() {
    this.sarvamApiKey = appConfig.sarvamAPI;
    this.ensureDebugDir();
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
    onTranscript: (result: { originalText: string; translatedText: string; detectedLanguage: string }) => void
  ): void {
    console.log(`🔌 [PLIVO-SERVICE] Initializing Sarvam WebSocket streams for call ${callId}`);

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

    this.activeStreams.set(callId, session);

    // Set up transcribeWs listeners
    transcribeWs.on('open', () => {
      console.log(`📡 [PLIVO-SERVICE] Transcribe WS opened for call ${callId}`);
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
            this.detectedLanguages.set(callId, response.data.language_code);
          }

          if (delta) {
            session.lastOriginal = current;
            session.pendingOriginal = (session.pendingOriginal + ' ' + delta).trim();
            this.triggerDebounce(callId);
          }
        } else if (response.type === 'error') {
          console.error(`❌ [PLIVO-SERVICE] Transcribe WS error response for call ${callId}:`, response.data);
        }
      } catch (err) {
        console.error(`❌ [PLIVO-SERVICE] Error parsing transcribe WS message for call ${callId}:`, err);
      }
    });

    transcribeWs.on('error', (err) => {
      console.error(`❌ [PLIVO-SERVICE] Transcribe WS socket error for call ${callId}:`, err);
    });

    transcribeWs.on('close', (code, reason) => {
      console.log(`🔌 [PLIVO-SERVICE] Transcribe WS closed for call ${callId}. Code: ${code}, Reason: ${reason}`);
    });

    // Set up translateWs listeners
    translateWs.on('open', () => {
      console.log(`📡 [PLIVO-SERVICE] Translate WS opened for call ${callId}`);
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
            this.triggerDebounce(callId);
          }
        } else if (response.type === 'error') {
          console.error(`❌ [PLIVO-SERVICE] Translate WS error response for call ${callId}:`, response.data);
        }
      } catch (err) {
        console.error(`❌ [PLIVO-SERVICE] Error parsing translate WS message for call ${callId}:`, err);
      }
    });

    translateWs.on('error', (err) => {
      console.error(`❌ [PLIVO-SERVICE] Translate WS socket error for call ${callId}:`, err);
    });

    translateWs.on('close', (code, reason) => {
      console.log(`🔌 [PLIVO-SERVICE] Translate WS closed for call ${callId}. Code: ${code}, Reason: ${reason}`);
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
        // wsSession.ws.send(audioBuffer);
      } catch (err) {
        console.error('❌ [PLIVO-SERVICE] Error sending audio chunk over WS:', err);
      }
    } else {
      wsSession.queue.push(audioBuffer);
    }
  }

  private triggerDebounce(callId: string): void {
    const session = this.activeStreams.get(callId);
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
          const current = this.activeTranscriptions.get(callId) || '';
          this.activeTranscriptions.set(callId, (current + ' ' + originalText).trim());
        }
        if (translatedText) {
          const current = this.activeTranslations.get(callId) || '';
          this.activeTranslations.set(callId, (current + ' ' + translatedText).trim());
        }

        // Only fall back to originalText if the text is English/ASCII
        const isEnglish = (session.detectedLanguage && session.detectedLanguage.startsWith('en')) || 
                          /^[\x00-\x7F]*$/.test(originalText);

        // Trigger callback
        session.onTranscript({
          originalText,
          translatedText: translatedText || (isEnglish ? originalText : ''),
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
   * Finalize streams, flush pending transcriptions, and close connections
   */
  async finalizeStreams(callId: string): Promise<{ originalText: string; translatedText: string }> {
    console.log(`🔌 [PLIVO-SERVICE] Finalizing streams for call ${callId}`);
    const session = this.activeStreams.get(callId);
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
      console.error('Error sending flush signal:', err);
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
      console.error('Error closing Sarvam WebSockets:', e);
    }

    // Remove from active streams
    this.activeStreams.delete(callId);

    // Also update accumulated transcripts one last time
    if (originalText) {
      const current = this.activeTranscriptions.get(callId) || '';
      this.activeTranscriptions.set(callId, (current + ' ' + originalText).trim());
    }
    if (translatedText) {
      const current = this.activeTranslations.get(callId) || '';
      this.activeTranslations.set(callId, (current + ' ' + translatedText).trim());
    }

    return { originalText, translatedText };
  }

  /**
   * Forward audio chunk to active streams
   */
  async transcribeAudio(audioBuffer: Buffer, callId: string): Promise<{ originalText: string; translatedText: string }> {
    const session = this.activeStreams.get(callId);
    if (session) {
      this.sendAudio(session.transcribeWsSession, audioBuffer);
      this.sendAudio(session.translateWsSession, audioBuffer);
    }
    return { originalText: '', translatedText: '' };
  }

  /**
   * Get complete transcript for a call
   */
  getTranscript(callId: string): string {
    return this.activeTranscriptions.get(callId) || '';
  }

  /**
   * Get English translation for a call
   */
  getTranslation(callId: string): string {
    return this.activeTranslations.get(callId) || '';
  }

  /**
   * Get detected language for a call
   */
  getDetectedLanguage(callId: string): string {
    return this.detectedLanguages.get(callId) || 'unknown';
  }

  /**
   * Clear transcript and audio buffers for a call
   */
  clearTranscript(callId: string): void {
    this.activeTranscriptions.delete(callId);
    this.activeTranslations.delete(callId);
    this.detectedLanguages.delete(callId);

    const session = this.activeStreams.get(callId);
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
      this.activeStreams.delete(callId);
    }
  }

  /**
   * Process any remaining audio chunks when call ends (redirects to finalizeStreams)
   */
  async processRemainingAudio(callId: string): Promise<{ originalText: string; translatedText: string }> {
    return this.finalizeStreams(callId);
  }
}
