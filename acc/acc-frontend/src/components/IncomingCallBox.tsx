import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import { Switch } from "./atoms/switch";
import {
  Phone,
  PhoneOff,
  Pause,
  Play,
  VolumeX,
  Volume2,
  Mic,
  MicOff,
  Send,
  Languages,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronUp,
  User,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlivoWebSocketService } from "@/hooks/services/plivoWebSocketService";
import type { PlivoTranscriptMessage } from "@/hooks/services/plivoWebSocketService";
import { env } from "@/config/env";
import Plivo from "plivo-browser-sdk";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { FarmerDetails } from "./FarmerDetails";
import { plivoApi } from "@/hooks/api/plivo/api";
import { toast } from "sonner";
import { translateService } from "@/hooks/services/translateService";
import { UserService } from "@/hooks/services/userService";
import { transcribeAudioWithSarvam } from "@/hooks/services/sarvamSttService";

const userService = new UserService();

interface IncomingCall {

  uuid: string;
  number: string;
  timestamp: string;
}

export interface CallTranscript {
  track: "inbound" | "outbound";
  text: string;
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  timestamp: string;
}

export interface IncomingCallBoxProps {
  onTranscriptChange?: (translatedTranscript: string) => void;
  onOriginalTranscriptChange?: (originalTranscript: string) => void;
  onTranscriptsListChange?: (transcripts: CallTranscript[]) => void;
  onCallStateChange?: (isActive: boolean) => void;
  onCallUuidChange?: (callUuid: string | null) => void;
  onPhoneNumberChange?: (phoneNumber: string | null) => void;
}

declare global {
  interface Window {
    Plivo: any;
  }
}

// things to do:- auth the websocket, call only for admin, and make transcript working, and make UI good,

export const IncomingCallBox = ({
  onTranscriptChange,
  onOriginalTranscriptChange,
  onTranscriptsListChange,
  onCallStateChange,
  onCallUuidChange,
  onPhoneNumberChange,
}: IncomingCallBoxProps) => {
  console.log(" [IncomingCallBox] Component mounting...");

  const { data: currentUser, isLoading: isUserLoading, refetch: refetchCurrentUser } = useGetCurrentUser();

  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  // Notify parent of active phone number change
  useEffect(() => {
    onPhoneNumberChange?.(incomingCall?.number || null);
  }, [incomingCall?.number, onPhoneNumberChange]);
  const [callStatus, setCallStatus] = useState<
    "idle" | "incoming" | "connected" | "held" | "ended"
  >("idle");
  const [transcripts, setTranscripts] = useState<CallTranscript[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [lastCallNumber, setLastCallNumber] = useState<string | null>(null);

  // Translation
  const [farmerDetectedLanguage, setFarmerDetectedLanguage] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("hi-IN");
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [sendTranslated, setSendTranslated] = useState(false);
  const languageManuallyChangedRef = useRef(false);

  // Collapsible UI Section States (secondary during call)
  const [isFarmerInfoExpanded, setIsFarmerInfoExpanded] = useState(false);
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);

  // Voice-to-Text STT States
  const [isSttRecording, setIsSttRecording] = useState(false);
  const [isSttTranscribing, setIsSttTranscribing] = useState(false);
  const sttMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sttAudioChunksRef = useRef<Blob[]>([]);

  // Active Call Timer & Scroll Floating Box States
  const [callTimerSeconds, setCallTimerSeconds] = useState(0);
  const [isFloatingBoxVisible, setIsFloatingBoxVisible] = useState(false);
  const telephonyPanelRef = useRef<HTMLDivElement | null>(null);

  // Call duration timer effect
  useEffect(() => {
    let timerInterval: ReturnType<typeof setInterval> | null = null;
    if (callStatus === "connected" || callStatus === "held") {
      timerInterval = setInterval(() => {
        setCallTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setCallTimerSeconds(0);
    }
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [callStatus]);

  // Format call timer (mm:ss)
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Floating call controls observer on scroll away
  useEffect(() => {
    if (!telephonyPanelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // When telephony panel is not intersecting (scrolled away), show floating box
        setIsFloatingBoxVisible(!entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(telephonyPanelRef.current);
    return () => observer.disconnect();
  }, []);

  const SARVAM_LANGUAGES = [
    { code: "en-IN", name: "English" },
    { code: "hi-IN", name: "Hindi" },
    { code: "bn-IN", name: "Bengali" },
    { code: "gu-IN", name: "Gujarati" },
    { code: "kn-IN", name: "Kannada" },
    { code: "ml-IN", name: "Malayalam" },
    { code: "mr-IN", name: "Marathi" },
    { code: "od-IN", name: "Odia" },
    { code: "pa-IN", name: "Punjabi" },
    { code: "ta-IN", name: "Tamil" },
    { code: "te-IN", name: "Telugu" },
    { code: "as-IN", name: "Assamese" },
    { code: "doi-IN", name: "Dogri" },
    { code: "kok-IN", name: "Konkani" },
    { code: "ks-IN", name: "Kashmiri" },
    { code: "mai-IN", name: "Maithili" },
    { code: "mni-IN", name: "Manipuri" },
    { code: "ne-IN", name: "Nepali" },
    { code: "sa-IN", name: "Sanskrit" },
    { code: "sat-IN", name: "Santali" },
    { code: "sd-IN", name: "Sindhi" },
    { code: "ur-IN", name: "Urdu" },
    { code: "brx-IN", name: "Bodo" },
  ];

  const wsRef = useRef<PlivoWebSocketService | null>(null);
  const plivoClientRef = useRef<any>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCallUuidRef = useRef<string | null>(null);
  const activeCallUuidRef = useRef<string | null>(null);
  const connectWebSocketRef = useRef<(() => void) | null>(null);

  // Voice-to-Text STT Handler with REAL-TIME Live Recognition
  const sttSpeechRecognitionRef = useRef<any>(null);

  const handleToggleSttRecording = async () => {
    if (isSttRecording) {
      if (sttSpeechRecognitionRef.current) {
        try {
          sttSpeechRecognitionRef.current.stop();
        } catch (e) { }
      }
      if (sttMediaRecorderRef.current && sttMediaRecorderRef.current.state !== "inactive") {
        sttMediaRecorderRef.current.stop();
      }
      setIsSttRecording(false);
      return;
    }

    // 1. Try Web Speech API first for REAL-TIME Live Speech-to-Text as user speaks
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        sttSpeechRecognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = selectedLanguage || "en-IN";

        const baseText = messageText ? messageText + " " : "";

        recognition.onresult = (event: any) => {
          let liveText = "";
          for (let i = 0; i < event.results.length; i++) {
            liveText += event.results[i][0].transcript;
          }
          setMessageText((baseText + liveText).trim());
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition error:", event.error);
          if (event.error === "not-allowed") {
            toast.error("Microphone access denied.");
            setIsSttRecording(false);
          }
        };

        recognition.onend = () => {
          setIsSttRecording(false);
        };

        recognition.start();
        setIsSttRecording(true);
        toast.info("Speak now...");
        return;
      } catch (err) {
        console.warn("Web Speech API error, falling back to Sarvam STT:", err);
      }
    }

    // 2. Fallback / Sarvam STT: Use MediaRecorder to capture complete valid audio stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rawMime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const mediaRecorder = new MediaRecorder(stream, rawMime ? { mimeType: rawMime } : undefined);
      sttMediaRecorderRef.current = mediaRecorder;
      sttAudioChunksRef.current = [];

      const cleanMime = (mediaRecorder.mimeType || "audio/webm").split(";")[0].trim();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          sttAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const fullAudioBlob = new Blob(sttAudioChunksRef.current, {
          type: cleanMime || "audio/webm",
        });

        if (fullAudioBlob.size === 0) {
          setIsSttRecording(false);
          return;
        }

        setIsSttTranscribing(true);
        try {
          const text = await transcribeAudioWithSarvam(fullAudioBlob, selectedLanguage);
          if (text && text.trim()) {
            setMessageText((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
            toast.success("Voice transcribed successfully!");
          }
        } catch (err: any) {
          console.error("STT Error:", err);
          toast.error(err.message || "Failed to transcribe audio.");
        } finally {
          setIsSttTranscribing(false);
          setIsSttRecording(false);
        }
      };

      mediaRecorder.start();
      setIsSttRecording(true);
      toast.info("Speak into your mic, click Mic again when finished.");
    } catch (err) {
      console.error("Microphone access error:", err);
      toast.error("Microphone access denied or unavailable.");
    }
  };

  const handleMarkAgentAsAvailable = async () => {
    try {
      await userService.markAgentAsAvailable();
    } catch (error) {
      console.error("❌ [IncomingCallBox] Failed to mark agent as available:", error);
    }
  };


  // Sync callbacks to refs to avoid effect dependencies
  const callbacksRef = useRef({
    onOriginalTranscriptChange,
    onTranscriptChange,
    onTranscriptsListChange,
  });

  // Helper function to get agent-specific Plivo credentials
  const getAgentCredentials = () => {
    const agentNumber = currentUser?.agent;
    if (!agentNumber || agentNumber === 'not_available') {
      // Fallback to old credentials if no agent assigned
      return {
        username: env.plivo.endpointUsername(),
        password: env.plivo.endpointPassword(),
      };
    }
    return env.plivo.getAgentCredentials(agentNumber);
  };

  useEffect(() => {
    callbacksRef.current = {
      onOriginalTranscriptChange,
      onTranscriptChange,
      onTranscriptsListChange,
    };
  });

  // Notify parent component when transcripts change
  useEffect(() => {
    const formattedOriginal = transcripts
      .map((t) => {
        const speaker = t.track === "inbound" ? "Caller" : "Agent";
        return `${speaker}: ${t.originalText}`;
      })
      .join("\n");
    const formattedTranslated = transcripts
      .map((t) => {
        const speaker = t.track === "inbound" ? "Caller" : "Agent";
        return `${speaker}: ${t.translatedText}`;
      })
      .join("\n");

    callbacksRef.current.onOriginalTranscriptChange?.(formattedOriginal);
    callbacksRef.current.onTranscriptChange?.(formattedTranslated);
    callbacksRef.current.onTranscriptsListChange?.(transcripts);
  }, [transcripts]);

  // Auto-reset call UI if stuck in 'incoming' state for too long
  useEffect(() => {
    if (callStatus === "incoming" && incomingCall) {
      // Set timeout to auto-reset after 30 seconds if call not answered
      callTimeoutRef.current = setTimeout(() => {
        console.log("⏰ Auto-resetting call UI after timeout");
        setCallStatus("idle");
        setIncomingCall(null);
        disconnectWebSocket();
        handleMarkAgentAsAvailable();
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

  // Detect first inbound (farmer) transcript language and lock it
  useEffect(() => {
    if (farmerDetectedLanguage) return; // Already locked
    if (languageManuallyChangedRef.current) return; // User manually changed language

    const firstInboundTranscript = transcripts.find(t => t.track === "inbound" && t.detectedLanguage && t.detectedLanguage !== "unknown");
    if (firstInboundTranscript) {
      setFarmerDetectedLanguage(firstInboundTranscript.detectedLanguage);
      setSelectedLanguage(firstInboundTranscript.detectedLanguage);
    }
  }, [transcripts, farmerDetectedLanguage, setSelectedLanguage]);

  // Reset manual language change flag when new call starts
  useEffect(() => {
    if (callStatus === "incoming") {
      languageManuallyChangedRef.current = false;
    }
  }, [callStatus]);

  // Extract only the fields that require re-initializing the Plivo SDK
  const agentId = currentUser?.agent;
  const isAgentActive = currentUser?.isCallAgentActive;
  const userRole = currentUser?.role;

  // Initialize Plivo SDK (NPM package) - Only for call agents
  useEffect(() => {
    // Skip if still loading
    if (isUserLoading) {
      return;
    }

    // Check if current user is authorized to use Plivo
    if (userRole !== "call_agent" || !isAgentActive) {
      return;
    }

    // Get agent-specific Plivo credentials
    const { username: endpointUsername, password: endpointPassword } = getAgentCredentials();

    // Check if Plivo credentials are configured (not dummy values)
    if (
      endpointUsername?.includes("dummy") ||
      endpointPassword?.includes("dummy")
    ) {
      console.warn(
        "⚠️ Plivo credentials not configured (using dummy values). Skipping Plivo initialization.",
      );
      return;
    }

    // Prevent multiple initializations
    if (plivoClientRef.current) {
      console.log("⚠️ Plivo client already exists, skipping initialization...");
      return;
    }

    initializePlivoClient();

    return () => {
      if (plivoClientRef.current) {
        try {
          plivoClientRef.current.client.logout();
          plivoClientRef.current = null;
        } catch (error) {
          console.error("Error logging out Plivo client:", error);
        }
      }
    };
  }, [agentId, isAgentActive, userRole, isUserLoading]);

  const initializePlivoClient = () => {
    // Prevent multiple initializations
    if (plivoClientRef.current) {
      console.log("⚠️ Plivo client already initialized, skipping...");
      return;
    }

    console.log("🔧 Initializing Plivo client from NPM package...");
    const options = {
      debug: "DEBUG" as const,
      permOnClick: true,
      enableTracking: true,
    };

    const client = new Plivo(options);
    plivoClientRef.current = client;

    // Get agent-specific Plivo credentials
    const { username: endpointUsername, password: endpointPassword } = getAgentCredentials();

    console.log("🔑 Attempting Plivo login with username:", endpointUsername);
    console.log("🌐 Plivo SDK loaded successfully");

    client.client.login(endpointUsername, endpointPassword);

    // Register event handlers using the correct Plivo SDK format
    client.client.on("onLogin", () => {
      // console.log('✅ Plivo client logged in successfully');
      // console.log('📞 Plivo client ready for incoming calls');
    });

    client.client.on("onLoginFailed", (error: any) => {
      console.error("❌ Plivo client login failed:", error);
      console.error("🔍 Login error details:", JSON.stringify(error, null, 2));

      // Retry logic for connection issues
      if (
        error?.message?.includes("Connection") ||
        error?.message?.includes("Network")
      ) {
        // console.log('🔄 Retrying login in 5 seconds due to connection error...');
        setTimeout(() => {
          console.log("🔄 Retrying Plivo login...");
          client.client.login(endpointUsername, endpointPassword);
        }, 5000);
      } else {
        alert("Plivo login failed: " + JSON.stringify(error));
      }
    });

    client.client.on(
      "onIncomingCall",
      (callerID, extraHeaders, callInfo: any, callerName: string) => {
        // console.log('📞 Incoming call from:', callerName);
        alert("Incoming call from " + callerName);

        let actualCallUuid = callInfo?.callUUID || callInfo?.calluuid || callerID;

        setIncomingCall({
          uuid: callerID,
          number: callerName,
          timestamp: new Date().toISOString(),
        });
        setLastCallNumber(callerName);
        setCallStatus("incoming");
        activeCallUuidRef.current = actualCallUuid;

        // Try to get the assigned call UUID from backend user document
        refetchCurrentUser().then((res: any) => {
          const backendCallUuid = res.data?.currentCallUuid;
          if (backendCallUuid) {
            actualCallUuid = backendCallUuid;
            activeCallUuidRef.current = backendCallUuid;
          }
          // console.log(`📞 [IncomingCallBox] Resolved call UUID for incoming: ${actualCallUuid}`);
          onCallUuidChange?.(actualCallUuid);
        }).catch((err) => {
          console.error("❌ [IncomingCallBox] Error refetching user on incoming call:", err);
          onCallUuidChange?.(actualCallUuid);
        });
      },
    );

    client.client.on("onCallAnswered", (callInfo?: any) => {
      // console.log('✅ [CALL ANSWERED] Event fired!');
      setCallStatus("connected");
      onCallStateChange?.(true);

      // Default ON: Auto-start transcript streaming when call is answered
      connectWebSocketRef.current?.();
      setIsRecording(true);

      let actualCallUuid = callInfo?.callUUID || callInfo?.calluuid;
      if (actualCallUuid) {
        activeCallUuidRef.current = actualCallUuid;
      }

      refetchCurrentUser().then((res: any) => {
        const backendCallUuid = res.data?.currentCallUuid;
        if (backendCallUuid) {
          actualCallUuid = backendCallUuid;
          activeCallUuidRef.current = backendCallUuid;
        }
        if (actualCallUuid) {
          // console.log(`📞 [IncomingCallBox] Resolved call UUID for answered: ${actualCallUuid}`);
          onCallUuidChange?.(actualCallUuid);
        }
      }).catch((err) => {
        console.error("❌ [IncomingCallBox] Error refetching user on call answered:", err);
        if (actualCallUuid) {
          onCallUuidChange?.(actualCallUuid);
        }
      });
    });

    client.client.on("onCallTerminated", () => {
      console.log("📴 Call ended");
      setCallStatus("ended");
      setIncomingCall(null);
      onCallStateChange?.(false);
      onCallUuidChange?.(null);
      disconnectWebSocket();
      // Mark agent as available when call ends
      handleMarkAgentAsAvailable();
    });

    client.client.on("onCallRejected", () => {
      console.log("❌ Call rejected");
      setCallStatus("idle");
      setIncomingCall(null);
      onCallUuidChange?.(null);
      handleMarkAgentAsAvailable();
    });

    // Additional debugging events
    client.client.on("onCalling", () => {
      // console.log('📞 Calling...');
    });

    client.client.on("onCallRemoteRinging", () => {
      // console.log('🔔 Remote ringing...');
    });

    client.client.on("onCallFailed", (error: any) => {
      console.error("❌ Call failed:", error);
      setCallStatus("idle");
      setIncomingCall(null);
      handleMarkAgentAsAvailable();
    });

    // Handle call cancelled by caller before answering
    client.client.on("onCallCancelled", () => {
      console.log("❌ Call cancelled by caller");
      setCallStatus("idle");
      setIncomingCall(null);
      onCallUuidChange?.(null);
      disconnectWebSocket();
      handleMarkAgentAsAvailable();
    });

    // Handle incoming call ended (caller hung up)
    client.client.on("onIncomingCallEnded", () => {
      console.log("📴 Incoming call ended");
      setCallStatus("idle");
      setIncomingCall(null);
      onCallUuidChange?.(null);
      disconnectWebSocket();
      handleMarkAgentAsAvailable();
    });


    client.client.on("onMediaConnected", () => {
      // console.log('🎧 Media connected');
    });

    client.client.on("onWebrtcNotSupported", () => {
      console.error("❌ WebRTC not supported");
      alert("WebRTC is not supported in this browser");
    });

    // Monitor connection status
    client.client.on("onConnectionChange", (status: any) => {
      // console.log('🌐 Connection status changed:', status);
      if (status === "disconnected") {
        // console.log('🔌 Connection lost, attempting to reconnect...');
        setTimeout(() => {
          if (
            plivoClientRef.current &&
            !plivoClientRef.current.client.isConnected
          ) {
            // console.log('🔄 Reconnecting to Plivo...');
            client.client.login(endpointUsername, endpointPassword);
          }
        }, 3000);
      }
    });
  };

  const connectWebSocket = () => {
    connectWebSocketRef.current = connectWebSocket;
    // console.log('🚀 [WEBSOCKET] connectWebSocket function called!');

    if (wsRef.current) {
      // console.log('⚠️ WebSocket already connected, skipping...');
      return;
    }

    // Clear transcripts from previous call only if call UUID changed
    const currentCallUuid = incomingCall?.uuid || null;
    if (currentCallUuid && currentCallUuid !== lastCallUuidRef.current) {
      setTranscripts([]);
      lastCallUuidRef.current = currentCallUuid;
    }

    // console.log('🔌 Initializing WebSocket connection...');
    const ws = new PlivoWebSocketService();
    wsRef.current = ws;

    // Setup message handlers
    ws.onMessage("transcript", (message: PlivoTranscriptMessage) => {
      // console.log('📝 [IncomingCallBox] Received transcript:', message);
      if (message.callId && activeCallUuidRef.current && message.callId !== activeCallUuidRef.current) {
        // Ignore transcripts for other concurrent calls
        return;
      }
      if (message.callId) {
        onCallUuidChange?.(message.callId);
      }
      if (message.originalText || message.translatedText) {
        const newTranscript: CallTranscript = {
          track: message.track || "inbound",
          text: message.text || "",
          originalText: message.originalText || "",
          translatedText: message.translatedText || "",
          detectedLanguage: message.detectedLanguage || "unknown",
          timestamp: message.timestamp,
        };

        setTranscripts((prev) => [...prev, newTranscript]);
      }
    });

    ws.onMessage("call_end", (message: any) => {
      // console.log('📴 Call ended from WebSocket:', message);
      if (message.callId && activeCallUuidRef.current && message.callId !== activeCallUuidRef.current) {
        // Ignore call end for other concurrent calls
        return;
      }
      if (message.callId) {
        onCallUuidChange?.(message.callId);
      }
      const finalItems: CallTranscript[] = [];

      const caller = message.caller || message.inbound;
      const agent = message.agent || message.outbound;

      if (
        caller &&
        (caller.transcript ||
          caller.translation ||
          caller.originalText ||
          caller.translatedText)
      ) {
        finalItems.push({
          track: "inbound",
          text:
            caller.transcript ||
            caller.finalTranscript ||
            caller.originalText ||
            "",
          originalText: caller.transcript || caller.originalText || "",
          translatedText: caller.translation || caller.translatedText || "",
          detectedLanguage: caller.detectedLanguage || "unknown",
          timestamp: message.timestamp || new Date().toISOString(),
        });
      }

      if (
        agent &&
        (agent.transcript ||
          agent.translation ||
          agent.originalText ||
          agent.translatedText)
      ) {
        finalItems.push({
          track: "outbound",
          text:
            agent.transcript ||
            agent.finalTranscript ||
            agent.originalText ||
            "",
          originalText: agent.transcript || agent.originalText || "",
          translatedText: agent.translation || agent.translatedText || "",
          detectedLanguage: agent.detectedLanguage || "unknown",
          timestamp: message.timestamp || new Date().toISOString(),
        });
      }

      if (finalItems.length > 0) {
        setTranscripts(finalItems);
      }

      setCallStatus("ended");
      setIncomingCall(null);
      onCallStateChange?.(false);
      onCallUuidChange?.(null);
      disconnectWebSocket();
    });

    ws.onMessage("call_disconnected", (message: PlivoTranscriptMessage) => {
      // console.log('❌ Call disconnected from WebSocket:', message);
      if (message.callId) {
        onCallUuidChange?.(message.callId);
      }
      setCallStatus("ended");
      setIncomingCall(null);
      onCallStateChange?.(false);
      onCallUuidChange?.(null);
      disconnectWebSocket();
    });

    // Connect to WebSocket
    const token = localStorage.getItem("token");
    console.log("🔑 [IncomingCallBox] Using token:", token ? "✅" : "❌ None");

    if (token) {
      ws.connect(token).catch((error) => {
        console.error(
          "❌ [IncomingCallBox] WebSocket connection failed with token:",
          error,
        );
        alert("WebSocket connection failed: " + error);
      });
    } else {
      ws.connect().catch((error) => {
        console.error(
          "❌ [IncomingCallBox] WebSocket connection failed without token:",
          error,
        );
        alert("WebSocket connection failed: " + error);
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
      client.client.answer(incomingCall.uuid);
      // Auto-connect transcript WebSocket when call is answered
      connectWebSocket();
      setIsRecording(true);
    } catch (error) {
      console.error("❌ [handleAnswer] Error calling answer:", error);
    }
  };

  const handleHangup = () => {
    if (plivoClientRef.current && plivoClientRef.current.client) {
      plivoClientRef.current.client.hangup();
    }
    setCallStatus("ended");
    setIncomingCall(null);
    onCallStateChange?.(false);
    onCallUuidChange?.(null);
    disconnectWebSocket();
    handleMarkAgentAsAvailable();
  };

  const handleReject = () => {
    if (plivoClientRef.current && incomingCall) {
      plivoClientRef.current.client.reject(incomingCall.uuid);
    }
  };

  const handleToggleHold = () => {
    if (plivoClientRef.current) {
      if (callStatus === "held") {
        plivoClientRef.current.client.unmute();
        setCallStatus("connected");
      } else {
        plivoClientRef.current.client.mute();
        setCallStatus("held");
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

  const handleSendMessage = async () => {
    const phoneNumber = incomingCall?.number || lastCallNumber;
    const textToSend = sendTranslated && translatedText ? translatedText : messageText;

    if (!textToSend.trim() || !phoneNumber) {
      return;
    }

    setIsSendingMessage(true);
    try {
      // Remove country code if present (matching CallHistory logic)
      const sanitizedNumber = phoneNumber.replace(/^91/, "");
      await plivoApi.sendMessage(sanitizedNumber, textToSend.trim());
      toast.success("SMS sent successfully!");
      setMessageText("");
      setTranslatedText(null);
      setSendTranslated(false);
    } catch (error) {
      console.error("Failed to send SMS:", error);
      toast.error("Failed to send SMS");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleTranslate = async () => {
    // Always check original messageText for translation, not the displayed translated text
    if (!messageText.trim()) {
      toast.error("Please enter text to translate");
      return;
    }

    // Always use selectedLanguage since that's what the user manually selected
    const targetLanguage = selectedLanguage;

    // Check if source and target languages are the same
    if (targetLanguage === "en-IN") {
      toast.error("Cannot translate to the same language (English). Please select a different target language.");
      return;
    }

    setTranslating(true);
    try {
      const translated = await translateService(messageText, targetLanguage, "en-IN");
      setTranslatedText(translated);
      toast.success("Text translated successfully!");
    } catch (err: any) {
      console.error("Translation error:", err);
      if (err.message?.includes("timeout") || err.message?.includes("504") || err.name === "AbortError") {
        toast.error("Translation request timed out. Please try again.");
      } else if (err.message?.includes("fetch") || err.message?.includes("network")) {
        toast.error("Network error. Please check your connection and try again.");
      } else if (err.message?.includes("Source and target languages must be different")) {
        toast.error("Source and target languages must be different. Please select a different target language.");
      } else {
        toast.error(`Failed to translate: ${err.message || "Unknown error"}`);
      }
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div
      ref={telephonyPanelRef}
      className={cn(
        "rounded-xl transition-all duration-300 relative",
        callStatus === "incoming"
          ? "p-[2px] from-white via-white to-white animate-pulse shadow-[0_0_15px_rgba(255,255,255,0.4)]"
          : "",
      )}
    >
      <Card
        className={cn(
          "transition-all duration-300 overflow-hidden",
          callStatus === "incoming" ? "border-2 border-white" : "",
          callStatus === "connected" ? "border-green-500/30" : "",
          callStatus === "held"
            ? "border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-950/5"
            : "",
        )}
      >
        <CardHeader className="px-4 border-b-0">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "p-1 rounded-lg transition-colors",
                  callStatus === "incoming"
                    ? "bg-amber-100 dark:bg-amber-950/40"
                    : callStatus === "connected"
                      ? "bg-emerald-100 dark:bg-emerald-950/40"
                      : callStatus === "held"
                        ? "bg-yellow-100 dark:bg-yellow-950/40"
                        : "bg-zinc-100 dark:bg-zinc-800",
                )}
              >
                <Phone
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    callStatus === "incoming"
                      ? "text-amber-600 dark:text-amber-400"
                      : callStatus === "connected"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : callStatus === "held"
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-zinc-500 dark:text-zinc-400",
                  )}
                />
              </div>
              <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {callStatus === "incoming"
                  ? "Incoming Call"
                  : callStatus === "connected"
                    ? "Active Call"
                    : callStatus === "held"
                      ? "Call On Hold"
                      : callStatus === "ended"
                        ? "Call Concluded"
                        : "Telephony Panel"}
              </span>
              {(callStatus === "connected" || callStatus === "held") && (
                <Badge variant="outline" className="font-mono text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  ⏱️ {formatTimer(callTimerSeconds)}
                </Badge>
              )}
            </div>
            <Badge
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all uppercase tracking-wider",
                callStatus === "connected"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : callStatus === "incoming"
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse"
                    : callStatus === "held"
                      ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                      : callStatus === "ended"
                        ? "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                        : "bg-zinc-500/10 text-zinc-400 border-zinc-500/10",
              )}
            >
              {callStatus}
            </Badge>
          </CardTitle>
        </CardHeader>

        {(callStatus === "idle" || callStatus === "ended") &&
          !incomingCall ? (
          <CardContent className="p-4">
            {lastCallNumber ? (
              <div className="space-y-3 bg-gradient-to-r from-zinc-50/80 via-zinc-100/40 to-zinc-50/80 dark:from-zinc-900/50 dark:via-zinc-900/30 dark:to-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60 p-4 rounded-xl shadow-sm animate-in fade-in duration-300">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Post-Call Follow-up SMS
                      </p>
                      <p className="text-[11px] text-zinc-400 font-mono">
                        Call ended with {lastCallNumber}
                      </p>
                    </div>
                  </div>
                  {translatedText && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="show-translated-post-call"
                        checked={sendTranslated}
                        onCheckedChange={setSendTranslated}
                      />
                      <label
                        htmlFor="show-translated-post-call"
                        className="text-xs font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer"
                      >
                        Show translated text
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 items-center pt-1">
                  <input
                    type="text"
                    value={sendTranslated && translatedText ? translatedText : messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type follow-up SMS message..."
                    className="flex-1 px-3.5 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-inner"
                    disabled={isSendingMessage || !!(sendTranslated && translatedText)}
                    readOnly={!!(sendTranslated && translatedText)}
                  />
                  <Button
                    type="button"
                    onClick={handleToggleSttRecording}
                    disabled={isSttTranscribing}
                    size="sm"
                    variant="outline"
                    className={cn(
                      "px-3 h-9 border-zinc-300 dark:border-zinc-700 transition-all shrink-0 font-medium text-xs gap-1.5",
                      isSttRecording && "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse"
                    )}
                    title={isSttRecording ? "Click to stop recording" : "Click to speak (Voice-to-Text)"}
                  >
                    {isSttTranscribing ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : isSttRecording ? (
                      <MicOff className="h-4 w-4 text-red-500 animate-bounce" />
                    ) : (
                      <Mic className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    )}
                  </Button>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!(sendTranslated && translatedText ? translatedText : messageText).trim() || isSendingMessage}
                    size="sm"
                    className="px-4 h-9 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md font-semibold shrink-0 gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send SMS</span>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Target Language:
                    </span>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => {
                        setSelectedLanguage(e.target.value);
                        languageManuallyChangedRef.current = true;
                      }}
                      className="px-2.5 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {SARVAM_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTranslate}
                    disabled={!(sendTranslated && translatedText ? translatedText : messageText).trim() || translating}
                    className="gap-1.5 h-7 text-xs"
                  >
                    {translating && (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    )}
                    <Languages className="h-3 w-3" />
                    Translate Message
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground p-1">
                <Phone className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  No active calls
                </span>
              </div>
            )}
          </CardContent>
        ) : (
          <CardContent className="p-4 space-y-4">
            {/* Active / Connected Call Status Panel (Space Optimized) */}
            <div className="bg-zinc-50/50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200/40 dark:border-zinc-800/40 space-y-4">
              {/* Top Row: Caller identity & Secondary Action Pills */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2.5 rounded-full shrink-0 flex items-center justify-center shadow-inner transition-colors",
                      callStatus === "incoming"
                        ? "bg-amber-500/10 text-amber-500 dark:bg-amber-500/20"
                        : callStatus === "connected"
                          ? "bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20"
                          : callStatus === "held"
                            ? "bg-yellow-500/10 text-yellow-500 dark:bg-yellow-500/20"
                            : "bg-zinc-500/10 text-zinc-500 dark:bg-zinc-500/20",
                    )}
                  >
                    <Phone
                      className={cn(
                        "h-4 w-4",
                        callStatus === "incoming" && "animate-bounce",
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {callStatus === "incoming"
                        ? "Incoming Call From"
                        : callStatus === "connected"
                          ? "Connected Call"
                          : callStatus === "held"
                            ? "Call On Hold"
                            : "Call Status"}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight font-mono">
                        {incomingCall?.number || "Unknown Caller"}
                      </span>
                      {incomingCall && (
                        <span className="text-[11px] text-zinc-400 font-mono">
                          Started:{" "}
                          {new Date(incomingCall.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Secondary Feature Pills (Farmer Info & Message) - Space Optimized Header Inline */}
                {(callStatus === "connected" || callStatus === "held") && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={isFarmerInfoExpanded ? "default" : "outline"}
                      onClick={() => setIsFarmerInfoExpanded((prev) => !prev)}
                      className="h-8 text-xs gap-1.5 rounded-lg font-medium shadow-sm"
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Farmer Info</span>
                      {isFarmerInfoExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant={isMessageExpanded ? "default" : "outline"}
                      onClick={() => setIsMessageExpanded((prev) => !prev)}
                      className="h-8 text-xs gap-1.5 rounded-lg font-medium shadow-sm"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Message</span>
                      {isMessageExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 my-1" />

              {/* Call Controls Group - Optimized Single Row / Grid */}
              <div className="flex flex-wrap gap-2 items-center">
                {callStatus === "incoming" && (
                  <div className="flex gap-2 w-full">
                    <Button
                      onClick={handleAnswer}
                      size="sm"
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md h-9 rounded-lg text-xs"
                    >
                      <Phone className="h-4 w-4" />
                      <span>Answer</span>
                    </Button>
                    <Button
                      onClick={handleReject}
                      size="sm"
                      variant="destructive"
                      className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-xs"
                    >
                      <PhoneOff className="h-4 w-4" />
                      <span>Reject</span>
                    </Button>
                  </div>
                )}

                {(callStatus === "connected" || callStatus === "held") && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
                    <Button
                      onClick={handleToggleRecording}
                      size="sm"
                      variant="outline"
                      className={cn(
                        "flex items-center justify-center gap-1.5 h-8.5 rounded-lg text-xs font-medium transition-all",
                        isRecording
                          ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/20 border-red-500/30 animate-pulse font-semibold"
                          : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-500/20 border-emerald-500/30 border",
                      )}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>{isRecording ? "Stop Transcript" : "Start Transcript"}</span>
                    </Button>

                    <Button
                      onClick={handleToggleHold}
                      size="sm"
                      variant="outline"
                      className="flex items-center justify-center gap-1.5 h-8.5 rounded-lg text-xs font-medium border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/50"
                    >
                      {callStatus === "held" ? (
                        <>
                          <Play className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                          <span>Resume</span>
                        </>
                      ) : (
                        <>
                          <Pause className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                          <span>Hold</span>
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleToggleMute}
                      size="sm"
                      variant={isMuted ? "destructive" : "outline"}
                      className={cn(
                        "flex items-center justify-center gap-1.5 h-8.5 rounded-lg text-xs font-medium border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/50",
                        isMuted &&
                        "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 dark:bg-orange-500/20 border-orange-500/30 font-semibold",
                      )}
                    >
                      {isMuted ? (
                        <>
                          <VolumeX className="h-3.5 w-3.5" />
                          <span>Unmute Agent</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                          <span>Mute Agent</span>
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleHangup}
                      size="sm"
                      variant="destructive"
                      className="flex items-center justify-center gap-1.5 h-8.5 rounded-lg shadow-md shadow-red-600/10 hover:shadow-lg hover:shadow-red-600/20 transition-all font-semibold text-xs bg-red-600 hover:bg-red-700 text-white"
                    >
                      <PhoneOff className="h-4 w-4" />
                      <span>Hang Up</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Expandable Sections (Only shown when explicitly expanded) */}
            {incomingCall && isFarmerInfoExpanded && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <FarmerDetails
                  phoneNo={incomingCall.number}
                  defaultOpen={true}
                  className="border border-zinc-200/40 dark:border-zinc-800/40 bg-zinc-50/20 dark:bg-zinc-900/10"
                />
              </div>
            )}

            {incomingCall && isMessageExpanded && (
              <div className="border border-zinc-200/40 dark:border-zinc-800/40 bg-zinc-50/20 dark:bg-zinc-900/10 p-4 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2 justify-between mb-2">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Send SMS to {incomingCall?.number}
                  </p>
                  {translatedText && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="show-translated-active"
                        checked={sendTranslated}
                        onCheckedChange={setSendTranslated}
                      />
                      <label
                        htmlFor="show-translated-active"
                        className="text-xs font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer"
                      >
                        Show translated text
                      </label>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sendTranslated && translatedText ? translatedText : messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type your SMS..."
                    className="flex-1 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    disabled={isSendingMessage || !!(sendTranslated && translatedText)}
                    readOnly={!!(sendTranslated && translatedText)}
                  />
                  <Button
                    type="button"
                    onClick={handleToggleSttRecording}
                    disabled={isSttTranscribing}
                    size="sm"
                    variant="outline"
                    className={cn(
                      "px-2.5 h-9 border-zinc-300 dark:border-zinc-700 transition-all",
                      isSttRecording && "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse"
                    )}
                    title={isSttRecording ? "Click to stop recording" : "Click to speak (Voice-to-Text)"}
                  >
                    {isSttTranscribing ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : isSttRecording ? (
                      <MicOff className="h-4 w-4 text-red-500 animate-bounce" />
                    ) : (
                      <Mic className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    )}
                  </Button>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!(sendTranslated && translatedText ? translatedText : messageText).trim() || isSendingMessage}
                    size="sm"
                    className="px-3 h-9 bg-primary hover:bg-primary/90 text-white"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Target Language:
                    </label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => {
                        setSelectedLanguage(e.target.value);
                        languageManuallyChangedRef.current = true;
                      }}
                      className="px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {SARVAM_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTranslate}
                    disabled={!(sendTranslated && translatedText ? translatedText : messageText).trim() || translating}
                    className="gap-1.5 h-7 text-xs"
                  >
                    {translating && (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    )}
                    <Languages className="h-3 w-3" />
                    Translate
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Floating Call Control Box when scrolled away from Telephony Panel */}
      {isFloatingBoxVisible && (callStatus === "connected" || callStatus === "held") && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 shadow-2xl rounded-2xl p-3 px-4 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  {incomingCall?.number || lastCallNumber || "Active Call"}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {formatTimer(callTimerSeconds)} • {callStatus}
                </span>
              </div>
            </div>

            <div className="h-6 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />

            <div className="flex items-center gap-1.5">
              <Button
                onClick={handleToggleRecording}
                size="sm"
                variant="outline"
                className={cn(
                  "h-8 text-xs font-medium px-2.5 rounded-lg transition-all",
                  isRecording
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/30 animate-pulse font-semibold"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                )}
                title={isRecording ? "Stop Transcript" : "Start Transcript"}
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                <span>{isRecording ? "Stop Transcript" : "Start Transcript"}</span>
              </Button>

              <Button
                onClick={handleToggleMute}
                size="sm"
                variant={isMuted ? "destructive" : "outline"}
                className={cn(
                  "h-8 text-xs px-2.5 rounded-lg",
                  isMuted && "bg-orange-500/10 text-orange-500 border-orange-500/30"
                )}
                title={isMuted ? "Unmute Agent" : "Mute Agent"}
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>

              <Button
                onClick={handleToggleHold}
                size="sm"
                variant="outline"
                className="h-8 text-xs px-2.5 rounded-lg border-zinc-300 dark:border-zinc-800"
                title={callStatus === "held" ? "Resume Call" : "Hold Call"}
              >
                {callStatus === "held" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </Button>

              <Button
                onClick={handleHangup}
                size="sm"
                variant="destructive"
                className="h-8 text-xs px-3 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white"
                title="Hang Up Call"
              >
                <PhoneOff className="h-3.5 w-3.5 mr-1" />
                <span>Hang Up</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomingCallBox;
