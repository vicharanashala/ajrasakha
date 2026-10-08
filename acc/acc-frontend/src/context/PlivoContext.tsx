import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import Plivo from "plivo-browser-sdk";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useAuthStore } from "@/stores/auth-store";
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

export interface UndeliveredCallAlert {
  callUuid?: string;
  number: string;
  timestamp: string;
  reason?: string;
}

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
  isNetworkWeak: boolean;
  undeliveredCallAlert: UndeliveredCallAlert | null;
  clearUndeliveredCallAlert: () => void;
  triggerUndeliveredAlert: (alert: { callUuid?: string; number: string; reason?: string }) => void;
  
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
  logoutPlivo: () => void;
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

const extractParentCallUuid = (...sources: any[]): string | undefined => {
  for (const src of sources) {
    if (!src) continue;
    if (typeof src === "string") {
      try {
        const parsed = JSON.parse(src);
        const res = extractParentCallUuid(parsed);
        if (res) return res;
      } catch {
        const match = src.match(/(?:X-PH-parentCallUuid|parentCallUuid|parent_call_uuid)[:=]\s*([a-zA-Z0-9_-]+)/i);
        if (match && match[1]) return match[1];
      }
    }
    if (typeof src !== "object") continue;
    const candidateObjects = [
      src,
      src.extraHeaders,
      src.sipHeaders,
      src.customHeaders,
      src.custom_headers,
      src.headers,
      src.params,
      src.callDetails,
    ].filter(Boolean);
    for (const h of candidateObjects) {
      if (typeof h !== "object") continue;
      for (const [k, v] of Object.entries(h)) {
        const normalized = k.toLowerCase().replace(/[-_]/g, "");
        if (
          normalized === "xphparentcalluuid" ||
          normalized === "parentcalluuid" ||
          normalized === "parentuuid" ||
          normalized === "parentcallid"
        ) {
          if (typeof v === "string" && v.trim()) return v.trim();
          if (typeof v === "number") return String(v);
        }
      }
    }
  }
  return undefined;
};

export const PlivoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: authUser } = useAuthStore();
  const { data: currentUser, isLoading: isUserLoading, refetch: refetchCurrentUser } = useGetCurrentUser({
    enabled: !!authUser,
  });

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

  // Network & undelivered call alerting states
  const [isNetworkWeak, setIsNetworkWeak] = useState(false);
  const [undeliveredCallAlert, setUndeliveredCallAlert] = useState<UndeliveredCallAlert | null>(null);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear undelivered alert helper
  const clearUndeliveredCallAlert = useCallback(() => {
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
    setUndeliveredCallAlert(null);
  }, []);

  // Trigger undelivered alert with strict 5-second auto-dismiss
  const triggerUndeliveredAlert = useCallback((alert: { callUuid?: string; number: string; reason?: string }) => {
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
    }
    setUndeliveredCallAlert({
      callUuid: alert.callUuid,
      number: alert.number,
      reason: alert.reason,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
    alertTimeoutRef.current = setTimeout(() => {
      setUndeliveredCallAlert(null);
      alertTimeoutRef.current = null;
    }, 5000);
  }, []);

  const triggerUndeliveredAlertRef = useRef(triggerUndeliveredAlert);
  triggerUndeliveredAlertRef.current = triggerUndeliveredAlert;

  // References
  const plivoClientRef = useRef<any>(null);
  const isPlivoConnectedRef = useRef(false);
  const incomingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<PlivoWebSocketService | null>(null);
  const activeCallUuidRef = useRef<string | null>(null);
  const parentCallUuidRef = useRef<string | null>(null);
  const lastCallUuidRef = useRef<string | null>(null);
  const activeCallInfoRef = useRef<{ number: string; direction: string } | null>(null);
  const isHangingUpRef = useRef(false);
  const handledAnsweredLegRef = useRef<string | null>(null);
  const currentUserRef = useRef<any>(currentUser);
  currentUserRef.current = currentUser;
  const callStatusRef = useRef(callStatus);
  callStatusRef.current = callStatus;

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
      const currentUuid = activeCallUuidRef.current || parentCallUuidRef.current;
      if (currentUuid && message.callId && currentUuid !== message.callId) {
        console.warn(`[PlivoContext] Ignoring call_start for foreign call ${message.callId} (Active: ${currentUuid})`);
        return;
      }

      if (message.callId) {
        activeCallUuidRef.current = message.callId;
        lastCallUuidRef.current = message.callId;
      }
      setTranscripts([]);
      setFarmerDetectedLanguage(null);
    });

    ws.onMessage("transcript", (message: PlivoTranscriptMessage) => {
      const currentUuid = activeCallUuidRef.current || parentCallUuidRef.current;
      if (currentUuid && message.callId && currentUuid !== message.callId) {
        // If incoming call was answered and activeCallUuidRef was holding the temporary bridge leg UUID,
        // and parentCallUuid hasn't been set yet, adopt the parent callId from the server.
        // If parentCallUuid is ALREADY set for this call, reject foreign call transcripts.
        if (
          !parentCallUuidRef.current &&
          activeCallInfoRef.current?.direction === "inbound" &&
          (callStatus === "connected" || callStatus === "held")
        ) {
          console.log(`🔗 [PlivoContext] Adopting server parent callId ${message.callId} for active connected leg`);
          activeCallUuidRef.current = message.callId;
          parentCallUuidRef.current = message.callId;
          setActiveCall((prev) => (prev ? { ...prev, uuid: message.callId || "" } : prev));
        } else {
          return;
        }
      }

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
      const currentUuid = activeCallUuidRef.current || parentCallUuidRef.current;
      if (currentUuid && message.callId && currentUuid !== message.callId) {
        return;
      }
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
        usePlivoStunServer: true,
        audioConstraints: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      plivoClientRef.current = client;

      client.client.login(endpointUsername, endpointPassword);

      client.client.on("onLogin", () => {
        isPlivoConnectedRef.current = true;
        console.log("✅ [PlivoContext] Plivo client logged in successfully as", endpointUsername);
      });

      client.client.on("onLoginFailed", (error: any) => {
        isPlivoConnectedRef.current = false;
        console.error("❌ [PlivoContext] Plivo login failed:", error);
        toast.error("Plivo login failed: " + (error?.message || "Check network/credentials"));
      });

      // Monitor WebSocket connection state to Plivo phone server
      client.client.on("onConnectionChange", (data: any) => {
        console.warn("🌐 [PlivoContext] Plivo connection change:", data);
        if (data?.state === "disconnected") {
          isPlivoConnectedRef.current = false;
          setIsNetworkWeak(true);
          userService.sendHeartbeat({ networkQuality: "weak" }).catch(() => {});
          toast.error("⚠️ Phone disconnected from call server. Unstable internet connection.", {
            id: "plivo-net-err",
            duration: 5000,
          });
        } else if (data?.state === "connected") {
          isPlivoConnectedRef.current = true;
          setIsNetworkWeak(false);
          toast.success("Phone connected to call server.", {
            id: "plivo-net-err",
            duration: 3000,
          });
        }
      });

      // Monitor WebRTC media quality metrics (high latency, packet loss, ICE timeout)
      client.client.on("mediaMetrics", (metric: any) => {
        if (metric?.type === "high_rtt" || metric?.type === "ice_timeout") {
          console.warn("⚠️ [PlivoContext] WebRTC network quality warning:", metric);
          setIsNetworkWeak(true);
        }
      });

      client.client.on("onIncomingCall", (callerID: string, _extraHeaders: any, callInfo: any, callerName: string) => {
        if (incomingWatchdogRef.current) {
          clearTimeout(incomingWatchdogRef.current);
          incomingWatchdogRef.current = null;
        }
        clearUndeliveredCallAlert();

        const callerPhone = callerName || callerID || "Unknown Caller";
        const callUuid = callInfo?.callUUID || callInfo?.calluuid || (callerID?.includes("-") ? callerID : undefined);

        const parentUuid = extractParentCallUuid(_extraHeaders, callInfo, callerID, callerName);
        if (parentUuid) {
          console.log(`🔗 [PlivoContext] Captured parentCallUuid from incoming headers: ${parentUuid}`);
          parentCallUuidRef.current = parentUuid;
        }

        const effectiveCallUuid = parentUuid || callUuid;
        console.log(`📞 [PlivoContext] Incoming call from: ${callerPhone}, callUUID: ${effectiveCallUuid} (original: ${callUuid}, parent: ${parentUuid})`);
        toast.info(`Incoming call from ${callerPhone}`, { duration: 5000 });

        setActiveCall({
          uuid: effectiveCallUuid || "",
          number: callerPhone,
          direction: "inbound",
          timestamp: new Date().toISOString(),
        });
        setCallStatus("incoming");
        const currentCallId = effectiveCallUuid || _extraHeaders?.call_uuid || callerID;
        activeCallUuidRef.current = currentCallId;
        activeCallInfoRef.current = { number: callerPhone, direction: "inbound" };

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
        console.log("✅ [PlivoContext] Call answered/connected", callInfo);
        setCallStatus("connected");
        isHangingUpRef.current = false;

        const parentUuid = extractParentCallUuid(callInfo, callInfo?.extraHeaders) || parentCallUuidRef.current;
        const answeredCallUuid =
          parentUuid ||
          (typeof callInfo?.callUUID === "string" && callInfo.callUUID) ||
          (typeof callInfo?.calluuid === "string" && callInfo.calluuid) ||
          (typeof activeCallUuidRef.current === "string" ? activeCallUuidRef.current : undefined);
        if (answeredCallUuid) {
          activeCallUuidRef.current = answeredCallUuid;
          setActiveCall((prev) =>
            prev ? { ...prev, uuid: answeredCallUuid } : { uuid: answeredCallUuid, number: "Unknown", direction: "inbound", timestamp: new Date().toISOString() }
          );

          // Deduplicate: Plivo SDK emits onCallAnswered multiple times per connection
          if (handledAnsweredLegRef.current === answeredCallUuid) {
            console.log(`ℹ️ [PlivoContext] Skipping duplicate onCallAnswered trigger for leg: ${answeredCallUuid}`);
            return;
          }
          handledAnsweredLegRef.current = answeredCallUuid;

          const currentPhone = activeCallInfoRef.current?.number || activeCall?.number || null;
          const currentDir = activeCallInfoRef.current?.direction || activeCall?.direction || "inbound";
          const activeUser = currentUserRef.current;
          const agentIdVal = activeUser?._id ? String(activeUser._id) : (activeUser?.agent || undefined);

          plivoApi.saveCallAnswered({
            callUuid: answeredCallUuid,
            phoneNumber: currentPhone || undefined,
            direction: currentDir,
            agentUserId: agentIdVal,
          }).then((res: any) => {
            if (res?.callUuid && res.callUuid !== answeredCallUuid) {
              console.log(`🔄 [PlivoContext] Updating active call UUID to server-resolved parent UUID: ${res.callUuid}`);
              activeCallUuidRef.current = res.callUuid;
              parentCallUuidRef.current = res.callUuid;
              setActiveCall((prev) => (prev ? { ...prev, uuid: res.callUuid } : prev));
            }
          }).catch((e) => console.warn("Failed to notify call answered:", e));
        }

        connectWebSocket();
        refetchCurrentUser().catch(() => {});
      });

      client.client.on("onCallTerminated", () => {
        console.log("📴 [PlivoContext] Call terminated");
        handledAnsweredLegRef.current = null;
        if (isHangingUpRef.current) {
          isHangingUpRef.current = false;
          return;
        }
        parentCallUuidRef.current = null;
        activeCallUuidRef.current = null;
        activeCallInfoRef.current = null;
        setCallStatus("ended");
        setActiveCall(null);
        setIsMuted(false);
        setIsHeld(false);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
      });

      client.client.on("onCallRejected", () => {
        console.log("❌ [PlivoContext] Call rejected");
        handledAnsweredLegRef.current = null;
        setCallStatus("idle");
        setActiveCall(null);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
      });

      client.client.on("onCallFailed", (error: any) => {
        console.error("❌ [PlivoContext] Call failed:", error);
        handledAnsweredLegRef.current = null;
        toast.error("Call failed: " + (error?.message || "Network/telephony error"));
        setCallStatus("idle");
        setActiveCall(null);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
      });

      client.client.on("onCallCancelled", () => {
        console.log("❌ [PlivoContext] Call cancelled");
        handledAnsweredLegRef.current = null;
        setCallStatus("idle");
        setActiveCall(null);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
      });
    };

    initializeClient();
  }, [agentId, isAgentActive, userRole, isUserLoading, handleMarkAgentAsAvailable, connectWebSocket, disconnectWebSocket, refetchCurrentUser]);

  // Real-time out-of-band undelivered call alerts via Server-Sent Events (SSE)
  useEffect(() => {
    if (userRole !== "call_agent" || !isAgentActive) return;

    let eventSource: EventSource | null = null;
    let isDisposed = false;

    const setupSSE = async () => {
      try {
        const firebaseUser = await getCurrentUser();
        if (!firebaseUser) return;
        const token = await getIdToken(firebaseUser);
        if (isDisposed) return;

        const apiBase = env.apiBaseUrl();
        const sseUrl = `${apiBase}/plivo/agent-alerts?token=${encodeURIComponent(token)}`;
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
          console.log("📡 [PlivoContext] SSE agent alert stream connected");
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "call_incoming_attempt") {
              const incomingId = data.callUuid || data.callId || "";
              const callerNumber = data.callerNumber || "Unknown Caller";
              console.log(`📞 [PlivoContext] SSE call_incoming_attempt registered at server for call ${incomingId} from ${callerNumber}`);

              // If the softphone is ALREADY disconnected (e.g. 2G/3G throttled or socket closed), alert IMMEDIATELY!
              if (!isPlivoConnectedRef.current) {
                console.warn(`🚨 [PlivoContext] Softphone is disconnected while call ${incomingId} is incoming. Alerting agent.`);
                triggerUndeliveredAlertRef.current({
                  callUuid: incomingId,
                  number: callerNumber,
                  reason: "Phone softphone is disconnected due to weak internet",
                });
                toast.error(
                  `⚠️ Missed incoming call from ${callerNumber}: Phone is disconnected due to weak internet.`,
                  { duration: 5000 }
                );
                return;
              }

              // If softphone is currently connected, set a realistic 20-second delivery watchdog
              // (16 seconds for IVR greeting + 4 seconds buffer for SIP ringing)
              if (incomingWatchdogRef.current) {
                clearTimeout(incomingWatchdogRef.current);
              }
              incomingWatchdogRef.current = setTimeout(() => {
                if (activeCallUuidRef.current !== incomingId && callStatusRef.current !== "incoming" && callStatusRef.current !== "connected") {
                  console.warn(`🚨 [PlivoContext] Call ${incomingId} did not reach softphone within 20s. Triggering undelivered alert.`);
                  triggerUndeliveredAlertRef.current({
                    callUuid: incomingId,
                    number: callerNumber,
                    reason: "Call failed to reach softphone within 20s due to weak internet",
                  });
                  toast.error(
                    `⚠️ Missed incoming call from ${callerNumber}: Call could not reach your interface due to weak internet.`,
                    { duration: 5000 }
                  );
                }
                incomingWatchdogRef.current = null;
              }, 20000);
            } else if (data.type === "call_delivery_failed") {
              if (incomingWatchdogRef.current) {
                clearTimeout(incomingWatchdogRef.current);
                incomingWatchdogRef.current = null;
              }
              console.warn("⚠️ [PlivoContext] SSE call_delivery_failed from server:", data);
              const incomingId = data.callUuid || data.callId || "";
              const callerNumber = data.callerNumber || "Unknown Caller";

              triggerUndeliveredAlertRef.current({
                callUuid: incomingId,
                number: callerNumber,
                reason: data.reason || "Call delivery failed at server due to network timeout",
              });
              toast.error(
                `⚠️ Missed incoming call from ${callerNumber}: Call could not reach your interface.`,
                { duration: 5000 }
              );
            }
          } catch (parseErr) {
            // Ignore keepalive comments or non-JSON pings
          }
        };

        eventSource.onerror = (err) => {
          // Native EventSource automatically reconnects in the background
          console.warn("⚠️ [PlivoContext] SSE alert stream interrupted, browser will auto-reconnect:", err);
        };
      } catch (err) {
        console.error("❌ [PlivoContext] Failed to setup SSE alert stream:", err);
      }
    };

    setupSSE();

    return () => {
      isDisposed = true;
      if (incomingWatchdogRef.current) {
        clearTimeout(incomingWatchdogRef.current);
        incomingWatchdogRef.current = null;
      }
      if (eventSource) {
        eventSource.close();
        console.log("🔌 [PlivoContext] SSE agent alert stream disconnected");
      }
    };
  }, [userRole, isAgentActive]);

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
        activeCallInfoRef.current = { number: formattedNumber, direction: "outbound" };

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
    handledAnsweredLegRef.current = null;
    if (plivoClientRef.current && plivoClientRef.current.client) {
      try {
        plivoClientRef.current.client.hangup();
      } catch (err) {
        console.warn("Hangup warning:", err);
        isHangingUpRef.current = false;
      }
    }
    parentCallUuidRef.current = null;
    activeCallUuidRef.current = null;
    activeCallInfoRef.current = null;
    setCallStatus("ended");
    setActiveCall(null);
    setIsMuted(false);
    setIsHeld(false);
    disconnectWebSocket();
    handleMarkAgentAsAvailable();
  }, [disconnectWebSocket, handleMarkAgentAsAvailable]);

  const rejectCall = useCallback(() => {
    handledAnsweredLegRef.current = null;
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
    handledAnsweredLegRef.current = null;
    setCallStatus("idle");
    setActiveCall(null);
    setTranscripts([]);
    setCallTimerSeconds(0);
    setLastCompletedCallDuration(null);
    disconnectWebSocket();
  }, [disconnectWebSocket]);

  const logoutPlivo = useCallback(() => {
    try {
      if (activeCallUuidRef.current && plivoClientRef.current?.client) {
        try {
          plivoClientRef.current.client.hangup();
        } catch (e) {
          console.warn("Error hanging up call on Plivo logout:", e);
        }
      }
      if (plivoClientRef.current) {
        console.log("🔌 [PlivoContext] Explicitly logging out Plivo client...");
        plivoClientRef.current.client.logout();
        plivoClientRef.current = null;
      }
    } catch (error) {
      console.error("Error logging out Plivo client:", error);
    }
    disconnectWebSocket();
    setCallStatus("idle");
    setActiveCall(null);
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
        isNetworkWeak,
        undeliveredCallAlert,
        clearUndeliveredCallAlert,
        triggerUndeliveredAlert,
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
        logoutPlivo,
      }}
    >
      {children}
      {/* Persistent audio elements for Plivo WebRTC softphone media output */}
      <audio id="plivo-audio-remote" autoPlay style={{ display: "none" }} />
      <audio id="plivo-audio-ringtone" autoPlay style={{ display: "none" }} />
    </PlivoContext.Provider>
  );
};

const defaultFallbackPlivoContext: PlivoContextType = {
  plivoClient: null,
  callStatus: "idle",
  activeCall: null,
  activePhoneNumber: null,
  activeCallUuid: null,
  callTimerSeconds: 0,
  lastCompletedCallDuration: null,
  transcripts: [],
  isMuted: false,
  isHeld: false,
  isRecording: false,
  farmerDetectedLanguage: null,
  selectedLanguage: "Kannada",
  setSelectedLanguage: () => {},
  languageManuallyChanged: false,
  setLanguageManuallyChanged: () => {},
  isNetworkWeak: false,
  undeliveredCallAlert: null,
  clearUndeliveredCallAlert: () => {},
  triggerUndeliveredAlert: () => {},
  initiateRedial: async () => false,
  answerCall: () => {},
  hangupCall: () => {},
  rejectCall: () => {},
  toggleMute: () => {},
  toggleHold: () => {},
  toggleRecording: () => {},
  connectWebSocket: () => {},
  disconnectWebSocket: () => {},
  resetCallState: () => {},
  logoutPlivo: () => {},
};

export const usePlivo = (): PlivoContextType => {
  const context = useContext(PlivoContext);
  if (!context) {
    return defaultFallbackPlivoContext;
  }
  return context;
};
