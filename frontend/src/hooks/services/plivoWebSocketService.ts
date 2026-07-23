import { env } from "@/config/env";

// Module-level flag to prevent duplicate connection alerts
let hasConnectionAlertShown = false;

export interface ActiveCallItem {
  callId: string;
  agentUserId?: string;
  agentName?: string;
  farmerNumber?: string;
  startTime: string;
  status: 'active' | 'ended';
}

export interface PlivoTranscriptMessage {
  type: 'transcript' | 'call_start' | 'call_end' | 'call_disconnected' | 'transcription_error' | 'live_audio_chunk' | 'active_call_started' | 'active_call_ended' | 'active_calls_list';
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
  payload?: string; // Base64 PCM chunk
  callInfo?: ActiveCallItem;
  activeCalls?: ActiveCallItem[];
}

export class PlivoWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, ((message: PlivoTranscriptMessage) => void)[]> = new Map();

  constructor() {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Setup default message handlers
    this.messageHandlers.set('transcript', [(message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('call_start', [(message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('call_end', [(message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('transcription_error', [(message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('live_audio_chunk', [(message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('active_call_started', [(message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('active_call_ended', [(message: PlivoTranscriptMessage) => {}]);
    this.messageHandlers.set('active_calls_list', [(message: PlivoTranscriptMessage) => {}]);
  }

  connect(token?: string): Promise<void> {
    // Reset reconnect attempts for fresh connection
    this.reconnectAttempts = 0;

    return new Promise((resolve, reject) => {
      try {
        // Use stream URL from env config (includes /plivo-stream path)
        const wsUrl = env.plivo.streamUrl();

        // EXPLICIT CONSOLE OUTPUT - Can't be missed!
        // console.log('🚀🚀🚀 [FRONTEND] WebSocket connect() function called!');
        // console.log(`🔌 [FRONTEND] Connecting to WebSocket URL: ${wsUrl}`);
        // console.log(`🔌 [FRONTEND] Token present: ${token ? 'YES' : 'NO'}`);
        // console.log(`🔌 [FRONTEND] Browser WebSocket support: ${typeof WebSocket !== 'undefined' ? 'YES' : 'NO'}`);

        // Also log to window for visibility
        if (typeof window !== 'undefined') {
          (window as any).frontendWsLog = '🔌 [FRONTEND] WebSocket connection initiated';
        }

        // IMMEDIATE ALERT - Can't be missed! (only show once)
        if (!hasConnectionAlertShown) {
          // alert('🔌 [FRONTEND] WebSocket connection initiated to: ' + wsUrl);
          hasConnectionAlertShown = true;
        }
        // console.log('🚨 IMMEDIATE ALERT: Check browser console for WebSocket logs!');

        this.ws = new WebSocket(wsUrl);
        // console.log(`🔌 [FRONTEND] WebSocket created, readyState: ${this.ws?.readyState}`);

        let isHandled = false;

        this.ws.onopen = () => {
          isHandled = true;
          this.reconnectAttempts = 0;
          console.log(`✅ [WEBSOCKET] Connected to ${wsUrl}`);
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
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          console.warn(`⚠️ [WEBSOCKET] Connection error to ${wsUrl}. Will attempt reconnect.`);
          if (!isHandled) {
            isHandled = true;
            resolve();
          }
        };

      } catch (error) {
        console.warn('⚠️ [WEBSOCKET] Connection setup error:', error);
        resolve();
      }
    });
  }

  private handleMessage(message: PlivoTranscriptMessage) {
    // console.log(`📥 [FRONTEND] Handling message type: ${message.type}`);
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      // console.log(`📥 [FRONTEND] Found ${handlers.length} handlers for type: ${message.type}`);
      handlers.forEach((handler, index) => {
        // console.log(`📥 [FRONTEND] Calling handler ${index} for type: ${message.type}`);
        handler(message);
      });
    } else {
      // console.log(`⚠️ [FRONTEND] No handlers found for message type: ${message.type}`);
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      // console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('❌ Max reconnection attempts reached');
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Stop reconnection attempts
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Allow components to register custom message handlers
  onMessage(type: string, handler: (message: PlivoTranscriptMessage) => void) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  // Remove message handlers
  offMessage(type: string, handler?: (message: PlivoTranscriptMessage) => void) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      if (handler) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      } else {
        // Clear all handlers for this type
        this.messageHandlers.delete(type);
      }
    }
  }

  subscribeLiveAudio(callId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe_live_audio', callId }));
    }
  }

  unsubscribeLiveAudio(callId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe_live_audio', callId }));
    }
  }

  requestActiveCalls() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'get_active_calls' }));
    }
  }
}
