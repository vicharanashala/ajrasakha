import { env } from "@/config/env";

// Module-level flag to prevent duplicate connection alerts
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

  constructor() {
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Setup default message handlers
    this.messageHandlers.set('transcript', [(message: PlivoTranscriptMessage) => {
      // console.log('📝 Live transcript:', message.text);
    }]);

    this.messageHandlers.set('call_start', [(message: PlivoTranscriptMessage) => {
      // console.log('📞 Call started:', message.data);
    }]);

    this.messageHandlers.set('call_end', [(message: PlivoTranscriptMessage) => {
      // console.log('📴 Call ended. Final transcript:', message.finalTranscript);
    }]);

    this.messageHandlers.set('transcription_error', [(message: PlivoTranscriptMessage) => {
      // console.error('❌ Transcription error:', message.error);
    }]);
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

        this.ws.onopen = () => {
          // console.log('✅ [WEBSOCKET] CONNECTION SUCCESSFUL!');
          // console.log('🔌 Connected to Plivo WebSocket');
          // console.log('🔌 [WebSocket] Ready state:', this.ws?.readyState);
          // console.log('🔌 [WebSocket] URL:', this.ws?.url);
          // console.log('🔌 [WebSocket] Protocol:', this.ws?.protocol);
          // console.log('🔌 [WebSocket] Connected at:', new Date().toISOString());
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: PlivoTranscriptMessage = JSON.parse(event.data);
            // console.log(`📥 [FRONTEND] Received WebSocket message:`, JSON.stringify(message, null, 2));
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ [FRONTEND] Failed to parse WebSocket message:', error);
            console.log('📥 [FRONTEND] Raw message data:', event.data);
          }
        };

        this.ws.onclose = () => {
          // console.log('❌ Disconnected from Plivo WebSocket');
          this.handleReconnect();
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
}
