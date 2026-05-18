import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import { Phone, PhoneOff, Pause, Play, VolumeX, Volume2, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlivoWebSocketService } from "@/hooks/services/plivoWebSocketService";
import type { PlivoTranscriptMessage } from "@/hooks/services/plivoWebSocketService";
import { env } from "@/config/env";
import Plivo from 'plivo-browser-sdk';
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";

interface IncomingCall {
  uuid: string;
  number: string;
  timestamp: string;
}

interface CallTranscript {
  text: string;
  timestamp: string;
}

export interface IncomingCallBoxProps {
  onTranscriptChange?: (transcript: string) => void;
  onCallStateChange?: (isActive: boolean) => void;
}

declare global {
  interface Window {
    Plivo: any;
  }
}

// things to do:- auth the websocket, call only for admin, and make transcript working, and make UI good,

export const IncomingCallBox = ({ onTranscriptChange, onCallStateChange }: IncomingCallBoxProps) => {
  console.log(' [IncomingCallBox] Component mounting...');

  const { data: currentUser, isLoading: isUserLoading } = useGetCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'incoming' | 'connected' | 'held' | 'ended'>('idle');
  const [transcripts, setTranscripts] = useState<CallTranscript[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSDKLoaded] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  const wsRef = useRef<PlivoWebSocketService | null>(null);
  const plivoClientRef = useRef<any>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-reset call UI if stuck in 'incoming' state for too long
  useEffect(() => {
    if (callStatus === 'incoming' && incomingCall) {
      // Set timeout to auto-reset after 30 seconds if call not answered
      callTimeoutRef.current = setTimeout(() => {
        console.log('⏰ Auto-resetting call UI after timeout');
        setCallStatus('idle');
        setIncomingCall(null);
        disconnectWebSocket();
      }, 30000);
    } else {
      // Clear timeout if call is answered or ended
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
    }

    return () => {
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
      }
    };
  }, [callStatus, incomingCall]);

  // Initialize Plivo SDK (NPM package) - Only for admins
  useEffect(() => {
    // Check if current user is authorized to use Plivo
    const targetUserId = env.plivo.targetUserId();
    const currentUserId = currentUser?._id;

    if (targetUserId && currentUserId !== targetUserId) {
      // console.log(`🚫 [IncomingCallBox] User ${currentUserId} not authorized. Target user: ${targetUserId}`);
      return;
    }

    if (!targetUserId) {
      // console.log('⚠️ [IncomingCallBox] No TARGET_USER_ID configured, allowing all users');
    }

    // Skip if still loading
    if (isUserLoading) {
      // console.log('🔒 [IncomingCallBox] Skipping Plivo init - user still loading');
      return;
    }

    // Prevent multiple initializations
    if (plivoClientRef.current) {
      console.log('⚠️ Plivo client already exists, skipping initialization...');
      return;
    }

    console.log('🔧 Initializing Plivo client from NPM package...');
    initializePlivoClient();

    return () => {
      if (plivoClientRef.current) {
        try {
          plivoClientRef.current.client.logout();
          plivoClientRef.current = null;
        } catch (error) {
          console.error('Error logging out Plivo client:', error);
        }
      }
    };
  // }, [isAdmin, isUserLoading]);
  }, []);

  const initializePlivoClient = () => {
    // Prevent multiple initializations
    if (plivoClientRef.current) {
      console.log('⚠️ Plivo client already initialized, skipping...');
      return;
    }

    console.log('🔧 Initializing Plivo client from NPM package...');
    const options = {
      debug: "DEBUG" as const,
      permOnClick: true,
      enableTracking: true
    };

    const client = new Plivo(options);
    plivoClientRef.current = client;

    // Login to endpoint
    const endpointUsername = env.plivo.endpointUsername();
    const endpointPassword = env.plivo.endpointPassword();

    console.log('🔑 Attempting Plivo login with username:', endpointUsername);
    console.log('🌐 Plivo SDK loaded successfully');

    client.client.login(endpointUsername, endpointPassword);

    // Register event handlers using the correct Plivo SDK format
    client.client.on('onLogin', () => {
      // console.log('✅ Plivo client logged in successfully');
      // console.log('📞 Plivo client ready for incoming calls');
    });

    client.client.on('onLoginFailed', (error: any) => {
      console.error('❌ Plivo client login failed:', error);
      console.error('🔍 Login error details:', JSON.stringify(error, null, 2));

      // Retry logic for connection issues
      if (error?.message?.includes('Connection') || error?.message?.includes('Network')) {
        // console.log('🔄 Retrying login in 5 seconds due to connection error...');
        setTimeout(() => {
          console.log('🔄 Retrying Plivo login...');
          client.client.login(endpointUsername, endpointPassword);
        }, 5000);
      } else {
        alert('Plivo login failed: ' + JSON.stringify(error));
      }
    });

    client.client.on('onIncomingCall', (callerID, extraHeaders, callInfo: {}, callerName: string) => {
      // console.log('📞 Incoming call from:', callerName);
      alert("Incoming call from " + callerName);
      setIncomingCall({
        uuid: callerID,
        number: callerName,
        timestamp: new Date().toISOString()
      });
      setCallStatus('incoming');
      // WebSocket will connect when call is answered, not here
    });

    client.client.on('onCallAnswered', () => {
      // console.log('✅ [CALL ANSWERED] Event fired!');
      // console.log('✅ Call answered - WebSocket already connected');
      setCallStatus('connected');
      onCallStateChange?.(true);
    });

    client.client.on('onCallTerminated', () => {
      console.log('📴 Call ended');
      setCallStatus('ended');
      setIncomingCall(null);
      onCallStateChange?.(false);
      disconnectWebSocket();
    });

    client.client.on('onCallRejected', () => {
      console.log('❌ Call rejected');
      setCallStatus('idle');
      setIncomingCall(null);
    });

    // Additional debugging events
    client.client.on('onCalling', () => {
      // console.log('📞 Calling...');
    });

    client.client.on('onCallRemoteRinging', () => {
      // console.log('🔔 Remote ringing...');
    });

    client.client.on('onCallFailed', (error: any) => {
      console.error('❌ Call failed:', error);
      setCallStatus('idle');
      setIncomingCall(null);
    });

    // Handle call cancelled by caller before answering
    client.client.on('onCallCancelled', () => {
      console.log('❌ Call cancelled by caller');
      setCallStatus('idle');
      setIncomingCall(null);
      disconnectWebSocket();
    });

    // Handle incoming call ended (caller hung up)
    client.client.on('onIncomingCallEnded', () => {
      console.log('📴 Incoming call ended');
      setCallStatus('idle');
      setIncomingCall(null);
      disconnectWebSocket();
    });

    client.client.on('onMediaConnected', () => {
      // console.log('🎧 Media connected');
    });

    client.client.on('onWebrtcNotSupported', () => {
      console.error('❌ WebRTC not supported');
      alert('WebRTC is not supported in this browser');
    });

    // Monitor connection status
    client.client.on('onConnectionChange', (status: any) => {
      // console.log('🌐 Connection status changed:', status);
      if (status === 'disconnected') {
        // console.log('🔌 Connection lost, attempting to reconnect...');
        setTimeout(() => {
          if (plivoClientRef.current && !plivoClientRef.current.client.isConnected) {
            // console.log('🔄 Reconnecting to Plivo...');
            client.client.login(endpointUsername, endpointPassword);
          }
        }, 3000);
      }
    });
  };

  const connectWebSocket = () => {
    // console.log('🚀 [WEBSOCKET] connectWebSocket function called!');

    if (wsRef.current) {
      // console.log('⚠️ WebSocket already connected, skipping...');
      return;
    }

    // console.log('🔌 Initializing WebSocket connection...');
    const ws = new PlivoWebSocketService();
    wsRef.current = ws;

    // Setup message handlers
    ws.onMessage('transcript', (message: PlivoTranscriptMessage) => {
      // console.log('📝 [IncomingCallBox] Received transcript:', message);
      if (message.text) {
        const newTranscript = {
          text: message.text,
          timestamp: message.timestamp
        };

        setTranscripts(prev => {
          const updated = [...prev, newTranscript];
          // Update parent component with full accumulated transcript
          const fullTranscript = updated.map(t => t.text).join(' ');
          onTranscriptChange?.(fullTranscript);
          return updated;
        });
      }
    });

    ws.onMessage('call_end', (message: PlivoTranscriptMessage) => {
      // console.log('📴 Call ended from WebSocket:', message);
      setCallStatus('ended');
      setIncomingCall(null);
      onCallStateChange?.(false);
      disconnectWebSocket();
    });

    ws.onMessage('call_disconnected', (message: PlivoTranscriptMessage) => {
      // console.log('❌ Call disconnected from WebSocket:', message);
      setCallStatus('ended');
      setIncomingCall(null);
      onCallStateChange?.(false);
      disconnectWebSocket();
    });

    // Connect to WebSocket
    const token = localStorage.getItem('token');
    console.log('🔑 [IncomingCallBox] Using token:', token ? '✅' : '❌ None');

    if (token) {
      ws.connect(token).catch((error) => {
        console.error('❌ [IncomingCallBox] WebSocket connection failed with token:', error);
        alert('WebSocket connection failed: ' + error);
      });
    } else {
      ws.connect().catch((error) => {
        console.error('❌ [IncomingCallBox] WebSocket connection failed without token:', error);
        alert('WebSocket connection failed: ' + error);
      });
    }
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
    // setTranscripts([]);
    setIsRecording(false);
  };

  const handleAnswer = () => {

    const client = plivoClientRef.current;

    if (!client) {
      console.error("❌ [handleAnswer] Plivo client not available");
      return;
    }

    if (!incomingCall) {
      console.error("❌ [handleAnswer] No incoming call");
      return;
    }

    try {
      connectWebSocket();
      client.client.answer(incomingCall.uuid);
      // console.log("✅ [handleAnswer] Answer called successfully");
    } catch (error) {
      console.error("❌ [handleAnswer] Error calling answer:", error);
    }
  };

  const handleHangup = () => {
    if (plivoClientRef.current) {
      plivoClientRef.current.client.hangup();
    }
  };

  const handleReject = () => {
    if (plivoClientRef.current && incomingCall) {
      plivoClientRef.current.client.reject(incomingCall.uuid);
    }
  };

  const handleToggleHold = () => {
    if (plivoClientRef.current) {
      if (callStatus === 'held') {
        plivoClientRef.current.client.unmute();
        setCallStatus('connected');
      } else {
        plivoClientRef.current.client.mute();
        setCallStatus('held');
      }
    }
  };

  const handleToggleMute = () => {
    if (plivoClientRef.current) {
      if (isMuted) {
        plivoClientRef.current.client.unmute();
        setIsMuted(false);
      } else {
        plivoClientRef.current.client.mute();
        setIsMuted(true);
      }
    }
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      // Stop recording - disconnect WebSocket
      disconnectWebSocket();
      setIsRecording(false);
    } else {
      // Start recording - connect WebSocket
      connectWebSocket();
      setIsRecording(true);
    }
  };


  return (
    <div className={cn(
      "rounded-xl transition-all duration-300",
      callStatus === 'incoming' ? "p-[2px] from-white via-white to-white animate-pulse shadow-[0_0_15px_rgba(255,255,255,0.5)]" : ""
    )}>
    <Card className={cn(
      "transition-all duration-300 p-2",
      callStatus === 'incoming' ? "border-2 border-white" : "",
      callStatus === 'connected' ? "border-green-200" : "",
      callStatus === 'held' ? "border-yellow-200 bg-yellow-50/50" : ""
    )}>
      <CardHeader className="p-2 pb-1">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-1.5 rounded-lg",
              callStatus === 'incoming' ? "bg-orange-100" :
                callStatus === 'connected' ? "bg-green-100" :
                  callStatus === 'held' ? "bg-yellow-100" : "bg-gray-100"
            )}>
              <Phone className={cn(
                "h-3.5 w-3.5",
                callStatus === 'incoming' ? "text-orange-600" :
                  callStatus === 'connected' ? "text-green-600" :
                    callStatus === 'held' ? "text-yellow-600" : "text-gray-600"
              )} />
            </div>
            <span className="text-sm">Incoming Call</span>
          </div>
          <Badge variant={callStatus === 'connected' ? 'default' : 'destructive'} className="text-xs px-1.5 py-0">
            {callStatus.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>

      {isAdmin ? (
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span className="text-base">Admin access only</span>
          </div>
        </CardContent>
      ) : ((callStatus === 'idle' || callStatus === 'ended') && !incomingCall) ? (
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span className="text-base">No active calls</span>
          </div>
        </CardContent>
      ) : (
        <CardContent className="space-y-2 flex flex-row gap-2 p-2 pt-1">
          {/* Call Info */}
          {incomingCall && (
            <div className="text-sm">
              <div className="font-medium">From: {incomingCall.number}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(incomingCall.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )}

          {/* Call Controls */}
          <div className="flex flex-wrap gap-2 justify-end w-full">
            {callStatus === 'incoming' && (
              <>
                <Button
                  onClick={handleAnswer}
                  size="sm"
                  className="flex items-center gap-1.5 bg-green-700 hover:bg-green-800 shadow-lg shadow-green-700/30 px-4 py-2 h-9"
                >
                  <Phone className="h-5 w-5" />
                  <span className="font-semibold">Answer</span>
                </Button>
                <Button
                  onClick={handleReject}
                  size="sm"
                  variant="destructive"
                  className="flex items-center gap-1.5 px-4 py-2 h-9 shadow-lg shadow-red-600/30"
                >
                  <PhoneOff className="h-5 w-5" />
                  <span className="font-semibold">Reject</span>
                </Button>
              </>
            )}

            {(callStatus === 'connected' || callStatus === 'held') && (
              <>
                <Button
                  onClick={handleHangup}
                  size="sm"
                  variant="destructive"
                  className="flex items-center gap-1.5 px-4 py-2 h-9 shadow-lg shadow-red-600/30"
                >
                  <PhoneOff className="h-5 w-5" />
                  <span className="font-semibold">Hang Up</span>
                </Button>

                <Button
                  onClick={handleToggleRecording}
                  size="sm"
                  variant={isRecording ? "destructive" : "default"}
                  className={cn(
                    "flex items-center gap-1.5 h-8",
                    isRecording && "animate-pulse"
                  )}
                >
                  {isRecording ? (
                    <>
                      <MicOff className="h-4 w-4" />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      <span>Record</span>
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleToggleHold}
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-1 h-8"
                >
                  {callStatus === 'held' ? (
                    <>
                      <Play className="h-4 w-4" />
                      Unhold
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4" />
                      Hold
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleToggleMute}
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-1 h-8"
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="h-4 w-4" />
                      Unmute
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-4 w-4" />
                      Mute
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
    </div>
  );
};

export default IncomingCallBox;
