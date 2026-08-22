import { env } from "@/config/env";

let hasConnectionAlertShown = false;

export interface PlivoTranscriptMessage {
  type: 'transcript' | 'call_start' | 'call_end' | 'call_disconnected' | 'transcription_error';
  callId: string;
  track?: 'inbound' | 'outbound';
  text?: string;
  finalTranscript?: string;
  originalText?: string;
  translatedText?: string;
  detectedLanguage?: string;
  timestamp: string;
  error?: string;
  data?: any;
}

export class PlivoWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, ((message: PlivoTranscriptMessage) => void)[]> = new Map();
  private currentToken: string | undefined = undefined;
  private isIntentionalDisconnect = false;

  constructor() {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.messageHandlers.set('transcript', [(_message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('call_start', [(_message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('call_end', [(_message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('transcription_error', [(_message: PlivoTranscriptMessage) => {}]);
  }

  connect(token?: string): Promise<void> {
    this.reconnectAttempts = 0;
    this.isIntentionalDisconnect = false;
    if (token) {
      this.currentToken = token;
    }

    return new Promise((resolve, reject) => {
      try {
        let wsUrl = env.plivo.streamUrl();
        const activeToken = token || this.currentToken;
        if (activeToken) {
          const separator = wsUrl.includes('?') ? '&' : '?';
          wsUrl = `${wsUrl}${separator}token=${encodeURIComponent(activeToken)}`;
        }

        if (typeof window !== 'undefined') {
          (window as any).frontendWsLog = '🔌 [FRONTEND] WebSocket connection initiated';
        }

        if (!hasConnectionAlertShown) {
          hasConnectionAlertShown = true;
        }

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: PlivoTranscriptMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ [FRONTEND] Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = () => {
          if (!this.isIntentionalDisconnect) {
            this.handleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: PlivoTranscriptMessage) {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => {
        handler(message);
      });
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      setTimeout(() => {
        this.connect(this.currentToken);
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached');
    }
  }

  disconnect() {
    this.isIntentionalDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onMessage(type: string, handler: (message: PlivoTranscriptMessage) => void) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  offMessage(type: string, handler?: (message: PlivoTranscriptMessage) => void) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      if (handler) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      } else {
        this.messageHandlers.delete(type);
      }
    }
  }
}
