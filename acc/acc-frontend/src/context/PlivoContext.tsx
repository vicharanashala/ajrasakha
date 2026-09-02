import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import Plivo from "plivo-browser-sdk";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { plivoApi } from "@/hooks/api/plivo/api";
import { PlivoWebSocketService } from "@/hooks/services/plivoWebSocketService";
import type { PlivoTranscriptMessage } from "@/hooks/services/plivoWebSocketService";
import { UserService } from "@/hooks/services/userService";
import { env } from "@/config/env";
import { toast } from "sonner";
import { getCurrentUser } from "@/hooks/api/api-fetch";
import { getIdToken } from "firebase/auth";

export interface CallTranscript {
  track: "inbound" | "outbound";
  text: string;
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  timestamp: string;
}

export interface ActiveCallInfo {
  uuid: string;
  number: string;
  direction: "inbound" | "outbound";
  timestamp: string;
}

export type CallStatus = "idle" | "incoming" | "calling" | "connected" | "held" | "ended";

export interface PlivoContextType {
  plivoClient: any | null;
  callStatus: CallStatus;
  activeCall: ActiveCallInfo | null;
  activePhoneNumber: string | null;
  activeCallUuid: string | null;
  callTimerSeconds: number;
  lastCompletedCallDuration: number | null;
  transcripts: CallTranscript[];
  isMuted: boolean;
  isHeld: boolean;
  isRecording: boolean;
  farmerDetectedLanguage: string | null;
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
  languageManuallyChanged: boolean;
  setLanguageManuallyChanged: (val: boolean) => void;
  
  // Actions
  initiateRedial: (phoneNumber: string, metadata?: any) => Promise<boolean>;
  answerCall: () => void;
  hangupCall: () => void;
  rejectCall: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  toggleRecording: () => void;
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  resetCallState: () => void;
}

const PlivoContext = createContext<PlivoContextType | null>(null);

const userService = new UserService();

const normalizePhoneNumber = (rawNumber: string): string => {
  if (!rawNumber) return "";
  let cleaned = rawNumber.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    return `+91${cleaned.substring(1)}`;
  }
  return `+${cleaned}`;
};

export const PlivoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: currentUser, isLoading: isUserLoading, refetch: refetchCurrentUser } = useGetCurrentUser();

  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [transcripts, setTranscripts] = useState<CallTranscript[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [callTimerSeconds, setCallTimerSeconds] = useState(0);
  const [lastCompletedCallDuration, setLastCompletedCallDuration] = useState<number | null>(null);
  
  // Translation state
  const [farmerDetectedLanguage, setFarmerDetectedLanguage] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("hi-IN");
  const [languageManuallyChanged, setLanguageManuallyChanged] = useState(false);

  // References
  const plivoClientRef = useRef<any>(null);
  const wsRef = useRef<PlivoWebSocketService | null>(null);
  const activeCallUuidRef = useRef<string | null>(null);
  const lastCallUuidRef = useRef<string | null>(null);
  const isHangingUpRef = useRef(false);

  // Active call duration timer
  useEffect(() => {
    let timerInterval: ReturnType<typeof setInterval> | null = null;
    if (callStatus === "incoming" || callStatus === "calling") {
      setCallTimerSeconds(0);
      setLastCompletedCallDuration(null);
    } else if (callStatus === "connected" || callStatus === "held") {
      timerInterval = setInterval(() => {
        setCallTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else if (callStatus === "ended") {
      setLastCompletedCallDuration(callTimerSeconds);
    }
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [callStatus]);

  // Mark agent as available helper
  const handleMarkAgentAsAvailable = useCallback(async () => {
    try {
      if (currentUser?._id) {
        await userService.markAgentAsAvailable();
        await refetchCurrentUser();
      }
    } catch (error) {
      console.error("❌ [PlivoContext] Failed to mark agent as available:", error);
    }
  }, [currentUser?._id, refetchCurrentUser]);

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.disconnect();
      } catch (err) {
        console.warn("Error disconnecting WS:", err);
      }
      wsRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // Connect WebSocket for live Sarvam STT stream
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      return;
    }

    const currentCallUuid = activeCallUuidRef.current || activeCall?.uuid || null;
    if (currentCallUuid && currentCallUuid !== lastCallUuidRef.current) {
      setTranscripts([]);
      lastCallUuidRef.current = currentCallUuid;
    }

    const ws = new PlivoWebSocketService();
    wsRef.current = ws;

    ws.onMessage("call_start", (message: PlivoTranscriptMessage) => {
      console.log("📞 [PlivoContext] New call stream started via WS:", message.callId);
      if (message.callId) {
        activeCallUuidRef.current = message.callId;
      }
      setTranscripts([]);
      setFarmerDetectedLanguage(null);
      lastCallUuidRef.current = message.callId || null;
    });

    ws.onMessage("transcript", (message: PlivoTranscriptMessage) => {
      if (message.callId && !activeCallUuidRef.current) {
        activeCallUuidRef.current = message.callId;
      }
      if (message.originalText || message.translatedText || message.text) {
        const newTranscript: CallTranscript = {
          track: message.track || "inbound",
          text: message.text || message.originalText || message.translatedText || "",
          originalText: message.originalText || message.text || "",
          translatedText: message.translatedText || message.text || "",
          detectedLanguage: message.detectedLanguage || "unknown",
          timestamp: message.timestamp || new Date().toISOString(),
        };

        setTranscripts((prev) => [...prev, newTranscript]);
      }
    });

    ws.onMessage("call_end", (message: any) => {
      console.log("📴 [PlivoContext] Call ended from WebSocket:", message);
      if (message.callId) {
        activeCallUuidRef.current = message.callId;
      }
    });

    const initConnection = async () => {
      let token: string | undefined = undefined;
      try {
        const firebaseUser = await getCurrentUser();
        if (firebaseUser) {
          token = await getIdToken(firebaseUser);
        }
      } catch (tokenErr) {
        console.warn("⚠️ [PlivoContext] Could not get Firebase token for WS:", tokenErr);
      }

      ws.connect(token).catch((error) => {
        console.error("❌ [PlivoContext] WebSocket connection failed:", error);
      });
    };

    initConnection();
    setIsRecording(true);
  }, [activeCall?.uuid]);

  // Detect language from inbound transcript
  useEffect(() => {
    if (farmerDetectedLanguage || languageManuallyChanged) return;
    const firstInbound = transcripts.find(
      (t) => t.track === "inbound" && t.detectedLanguage && t.detectedLanguage !== "unknown"
    );
    if (firstInbound) {
      setFarmerDetectedLanguage(firstInbound.detectedLanguage);
      setSelectedLanguage(firstInbound.detectedLanguage);
    }
  }, [transcripts, farmerDetectedLanguage, languageManuallyChanged]);

  // Extract agent attributes
  const agentId = currentUser?.agent;
  const isAgentActive = currentUser?.isCallAgentActive;
  const userRole = currentUser?.role;

  // Initialize and maintain Plivo Browser SDK Session
  useEffect(() => {
    if (isUserLoading) return;

    if (userRole !== "call_agent" || !isAgentActive) {
      if (plivoClientRef.current) {
        try {
          console.log("🔌 [PlivoContext] Logging out Plivo client because agent is offline/inactive...");
          plivoClientRef.current.client.logout();
          plivoClientRef.current = null;
        } catch (error) {
          console.error("Error logging out Plivo client:", error);
        }
      }
      return;
    }

    if (plivoClientRef.current) return;

    const initializeClient = async () => {
      console.log("🔧 [PlivoContext] Initializing Plivo client for agent:", agentId);
      let endpointUsername = "";
      let endpointPassword = "";

      try {
        const creds = await plivoApi.getAgentCredentials();
        endpointUsername = creds?.username || "";
        endpointPassword = creds?.password || "";
      } catch (err) {
        console.warn("⚠️ [PlivoContext] Credentials fetch warning:", err);
        endpointUsername = env.plivo.endpointUsername();
        endpointPassword = env.plivo.endpointPassword();
      }

      if (!endpointUsername || !endpointPassword || endpointUsername.includes("dummy")) {
        console.warn("⚠️ [PlivoContext] Plivo agent credentials not configured. Skipping login.");
        return;
      }

      const client: any = new (Plivo as any)({
        debug: "DEBUG",
        permOnClick: true,
        enableTracking: true,
      });
      plivoClientRef.current = client;

      client.client.login(endpointUsername, endpointPassword);

      client.client.on("onLogin", () => {
        console.log("✅ [PlivoContext] Plivo client logged in successfully as", endpointUsername);
      });

      client.client.on("onLoginFailed", (error: any) => {
        console.error("❌ [PlivoContext] Plivo login failed:", error);
        toast.error("Plivo login failed: " + (error?.message || "Check network/credentials"));
      });

      client.client.on("onIncomingCall", (callerID: string, _extraHeaders: any, callInfo: any, callerName: string) => {
        const callerPhone = callerName || callerID || "Unknown Caller";
        const callUuid = callInfo?.callUUID || callInfo?.calluuid || (callerID?.includes("-") ? callerID : undefined);

        console.log(`📞 [PlivoContext] Incoming call from: ${callerPhone}, callUUID: ${callUuid}`);
        toast.info(`Incoming call from ${callerPhone}`, { duration: 5000 });

        setActiveCall({
          uuid: callUuid || "",
          number: callerPhone,
          direction: "inbound",
          timestamp: new Date().toISOString(),
        });
        setCallStatus("incoming");
        const currentCallId = callUuid || _extraHeaders?.call_uuid || callerID;
        activeCallUuidRef.current = currentCallId;

        setTranscripts([]);
        setFarmerDetectedLanguage(null);
        setLanguageManuallyChanged(false);
        lastCallUuidRef.current = null;

        refetchCurrentUser().catch(() => {});
      });

      client.client.on("onCalling", () => {
        console.log("📞 [PlivoContext] Dialing outbound call...");
        setCallStatus("calling");
      });

      client.client.on("onCallRemoteRinging", () => {
        console.log("🔔 [PlivoContext] Remote party ringing...");
      });

      client.client.on("onCallAnswered", (callInfo?: any) => {
        console.log("✅ [PlivoContext] Call answered/connected");
        setCallStatus("connected");
        isHangingUpRef.current = false;

        const answeredCallUuid =
          (typeof callInfo?.callUUID === "string" && callInfo.callUUID) ||
          (typeof callInfo?.calluuid === "string" && callInfo.calluuid) ||
          (typeof activeCallUuidRef.current === "string" ? activeCallUuidRef.current : undefined);
        if (answeredCallUuid) {
          activeCallUuidRef.current = answeredCallUuid;
          setActiveCall((prev) =>
            prev ? { ...prev, uuid: answeredCallUuid } : { uuid: answeredCallUuid, number: "Unknown", direction: "inbound", timestamp: new Date().toISOString() }
          );
        }

        connectWebSocket();
        refetchCurrentUser().catch(() => {});
      });

      client.client.on("onCallTerminated", () => {
        console.log("📴 [PlivoContext] Call terminated");
        if (isHangingUpRef.current) {
          isHangingUpRef.current = false;
          return;
        }
        activeCallUuidRef.current = null;
        setCallStatus("ended");
        setActiveCall(null);
        setIsMuted(false);
        setIsHeld(false);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
      });

      client.client.on("onCallRejected", () => {
        console.log("❌ [PlivoContext] Call rejected");
        setCallStatus("idle");
        setActiveCall(null);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
      });

      client.client.on("onCallFailed", (error: any) => {
        console.error("❌ [PlivoContext] Call failed:", error);
        toast.error("Call failed: " + (error?.message || "Network/telephony error"));
        setCallStatus("idle");
        setActiveCall(null);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
      });

      client.client.on("onCallCancelled", () => {
        console.log("❌ [PlivoContext] Call cancelled");
        setCallStatus("idle");
        setActiveCall(null);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
      });
    };

    initializeClient();
  }, [agentId, isAgentActive, userRole, isUserLoading, handleMarkAgentAsAvailable, connectWebSocket, disconnectWebSocket, refetchCurrentUser]);

  // Outbound Redial Handler
  const initiateRedial = useCallback(
    async (phoneNumber: string, metadata?: any): Promise<boolean> => {
      const client = plivoClientRef.current;
      if (!client || !client.client) {
        toast.error("Softphone is not initialized or logged in. Please ensure you are Online.");
        return false;
      }

      const formattedNumber = normalizePhoneNumber(phoneNumber);
      if (!formattedNumber || formattedNumber.length < 10) {
        toast.error(`Invalid phone number to redial: ${phoneNumber}`);
        return false;
      }

      try {
        console.log(`📞 [PlivoContext] Initiating Redial to ${formattedNumber}...`);
        
        // Reset call audio & UI state
        setTranscripts([]);
        setFarmerDetectedLanguage(null);
        setLanguageManuallyChanged(false);
        setCallTimerSeconds(0);
        setLastCompletedCallDuration(null);
        setIsMuted(false);
        setIsHeld(false);

        const callId = `outbound_${Date.now()}`;
        activeCallUuidRef.current = callId;

        setActiveCall({
          uuid: callId,
          number: formattedNumber,
          direction: "outbound",
          timestamp: new Date().toISOString(),
        });
        setCallStatus("calling");

        const extraHeaders = {
          "X-PH-destination": formattedNumber,
          "X-PH-callType": "outbound",
          "X-PH-agentId": currentUser?.agent || currentUser?._id?.toString() || "agent",
          ...(metadata || {}),
        };

        const result = client.client.call(formattedNumber, extraHeaders);
        console.log(`✅ [PlivoContext] Plivo client.call initiated. Result:`, result);
        
        if (result && typeof result === "string") {
          activeCallUuidRef.current = result;
          setActiveCall((prev) => (prev ? { ...prev, uuid: result } : null));
        }

        // Auto-connect streaming WebSocket
        connectWebSocket();
        toast.success(`Redialing ${formattedNumber}...`);
        return true;
      } catch (error: any) {
        console.error("❌ [PlivoContext] Redial failed:", error);
        toast.error(error?.message || "Failed to initiate outbound redial call");
        setCallStatus("idle");
        setActiveCall(null);
        return false;
      }
    },
    [currentUser?.agent, currentUser?._id, connectWebSocket]
  );

  const answerCall = useCallback(() => {
    const client = plivoClientRef.current;
    if (!client || !client.client) {
      toast.error("Plivo client not available");
      return;
    }
    try {
      client.client.answer();
      connectWebSocket();
      setIsRecording(true);
    } catch (error: any) {
      console.error("❌ [PlivoContext] Error answering call:", error);
      toast.error(error.message || "Failed to answer call");
    }
  }, [connectWebSocket]);

  const hangupCall = useCallback(() => {
    isHangingUpRef.current = true;
    if (plivoClientRef.current && plivoClientRef.current.client) {
      try {
        plivoClientRef.current.client.hangup();
      } catch (err) {
        console.warn("Hangup warning:", err);
        isHangingUpRef.current = false;
      }
    }
    activeCallUuidRef.current = null;
    setCallStatus("ended");
    setActiveCall(null);
    setIsMuted(false);
    setIsHeld(false);
    disconnectWebSocket();
    handleMarkAgentAsAvailable();
  }, [disconnectWebSocket, handleMarkAgentAsAvailable]);

  const rejectCall = useCallback(() => {
    if (plivoClientRef.current && plivoClientRef.current.client) {
      try {
        plivoClientRef.current.client.reject();
      } catch (error) {
        console.error("❌ [PlivoContext] Error rejecting call:", error);
      }
    }
    setCallStatus("idle");
    setActiveCall(null);
    disconnectWebSocket();
    handleMarkAgentAsAvailable();
  }, [disconnectWebSocket, handleMarkAgentAsAvailable]);

  const toggleMute = useCallback(() => {
    if (plivoClientRef.current?.client) {
      if (isMuted) {
        plivoClientRef.current.client.unmute();
        setIsMuted(false);
      } else {
        plivoClientRef.current.client.mute();
        setIsMuted(true);
      }
    }
  }, [isMuted]);

  const toggleHold = useCallback(() => {
    if (plivoClientRef.current?.client) {
      if (isHeld) {
        plivoClientRef.current.client.unmute();
        setIsHeld(false);
        setCallStatus("connected");
      } else {
        plivoClientRef.current.client.mute();
        setIsHeld(true);
        setCallStatus("held");
      }
    }
  }, [isHeld]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      disconnectWebSocket();
      setIsRecording(false);
    } else {
      connectWebSocket();
      setIsRecording(true);
    }
  }, [isRecording, connectWebSocket, disconnectWebSocket]);

  const resetCallState = useCallback(() => {
    setCallStatus("idle");
    setActiveCall(null);
    setTranscripts([]);
    setCallTimerSeconds(0);
    setLastCompletedCallDuration(null);
    disconnectWebSocket();
  }, [disconnectWebSocket]);

  return (
    <PlivoContext.Provider
      value={{
        plivoClient: plivoClientRef.current,
        callStatus,
        activeCall,
        activePhoneNumber: activeCall?.number || null,
        activeCallUuid: activeCall?.uuid || null,
        callTimerSeconds,
        lastCompletedCallDuration,
        transcripts,
        isMuted,
        isHeld,
        isRecording,
        farmerDetectedLanguage,
        selectedLanguage,
        setSelectedLanguage,
        languageManuallyChanged,
        setLanguageManuallyChanged,
        initiateRedial,
        answerCall,
        hangupCall,
        rejectCall,
        toggleMute,
        toggleHold,
        toggleRecording,
        connectWebSocket,
        disconnectWebSocket,
        resetCallState,
      }}
    >
      {children}
      {/* Persistent audio elements for Plivo WebRTC softphone media output */}
      <audio id="plivo-audio-remote" autoPlay style={{ display: "none" }} />
      <audio id="plivo-audio-ringtone" autoPlay style={{ display: "none" }} />
    </PlivoContext.Provider>
  );
};

export const usePlivo = (): PlivoContextType => {
  const context = useContext(PlivoContext);
  if (!context) {
    throw new Error("usePlivo must be used within a PlivoProvider");
  }
  return context;
};
