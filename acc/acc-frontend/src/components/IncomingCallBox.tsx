import { useEffect, useState, useRef } from "react";
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
  MessageSquare,
  Loader2,
  Clock,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  PhoneCall,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlivo } from "@/context/PlivoContext";
import type { CallTranscript } from "@/context/PlivoContext";
import { plivoApi } from "@/hooks/api/plivo/api";
import { toast } from "sonner";
import { translateService } from "@/hooks/services/translateService";
import { transcribeAudioWithSarvam } from "@/hooks/services/sarvamSttService";

export type { CallTranscript };

export interface IncomingCallBoxProps {
  onTranscriptChange?: (translatedTranscript: string) => void;
  onOriginalTranscriptChange?: (originalTranscript: string) => void;
  onTranscriptsListChange?: (transcripts: CallTranscript[]) => void;
  onCallStateChange?: (isActive: boolean) => void;
  onCallUuidChange?: (callUuid: string | null) => void;
  onPhoneNumberChange?: (phoneNumber: string | null) => void;
  extractedFarmerProfile?: any;
}

export const IncomingCallBox = ({
  onTranscriptChange,
  onOriginalTranscriptChange,
  onTranscriptsListChange,
  onCallStateChange,
  onCallUuidChange,
  onPhoneNumberChange,
  extractedFarmerProfile,
}: IncomingCallBoxProps) => {
  const {
    callStatus,
    activeCall,
    activePhoneNumber,
    activeCallUuid,
    callTimerSeconds,
    lastCompletedCallDuration,
    transcripts,
    isMuted,
    isRecording,
    selectedLanguage,
    setSelectedLanguage,
    setLanguageManuallyChanged,
    answerCall,
    hangupCall,
    rejectCall,
    toggleMute,
    toggleHold,
    toggleRecording,
  } = usePlivo();

  // Local component states
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [sendTranslated, setSendTranslated] = useState(false);
  const [lastCallNumber, setLastCallNumber] = useState<string | null>(null);

  // Collapsible UI Section States
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);

  // Voice-to-Text STT States
  const [isSttRecording, setIsSttRecording] = useState(false);
  const [isSttTranscribing, setIsSttTranscribing] = useState(false);
  const sttMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sttAudioChunksRef = useRef<Blob[]>([]);
  const sttSpeechRecognitionRef = useRef<any>(null);

  // Floating control box state
  const [isFloatingBoxVisible, setIsFloatingBoxVisible] = useState(false);
  const telephonyPanelRef = useRef<HTMLDivElement | null>(null);

  // Sync callbacks ref to prevent stale closures
  const callbacksRef = useRef({
    onTranscriptChange,
    onOriginalTranscriptChange,
    onTranscriptsListChange,
    onCallStateChange,
    onCallUuidChange,
    onPhoneNumberChange,
  });

  useEffect(() => {
    callbacksRef.current = {
      onTranscriptChange,
      onOriginalTranscriptChange,
      onTranscriptsListChange,
      onCallStateChange,
      onCallUuidChange,
      onPhoneNumberChange,
    };
  });

  // Track last call number for SMS follow-ups
  useEffect(() => {
    if (activePhoneNumber) {
      setLastCallNumber(activePhoneNumber);
    }
  }, [activePhoneNumber]);

  // Sync active phone number to parent
  useEffect(() => {
    callbacksRef.current.onPhoneNumberChange?.(activePhoneNumber);
  }, [activePhoneNumber]);

  // Sync active call UUID to parent
  useEffect(() => {
    callbacksRef.current.onCallUuidChange?.(activeCallUuid);
  }, [activeCallUuid]);

  // Sync call active state to parent
  useEffect(() => {
    const isActive = callStatus === "connected" || callStatus === "held" || callStatus === "calling";
    callbacksRef.current.onCallStateChange?.(isActive);
  }, [callStatus]);

  // Sync transcripts to parent
  useEffect(() => {
    callbacksRef.current.onTranscriptsListChange?.(transcripts);
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
  }, [transcripts]);

  // Floating call controls observer on scroll away
  useEffect(() => {
    if (!telephonyPanelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsFloatingBoxVisible(!entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(telephonyPanelRef.current);
    return () => observer.disconnect();
  }, []);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const displayTimerSeconds =
    lastCompletedCallDuration !== null && (callStatus === "ended" || callStatus === "idle")
      ? lastCompletedCallDuration
      : callTimerSeconds;

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

  // Voice-to-Text STT Handler
  const handleToggleSttRecording = async () => {
    if (isSttRecording) {
      if (sttSpeechRecognitionRef.current) {
        try {
          sttSpeechRecognitionRef.current.stop();
        } catch (e) {}
      }
      if (sttMediaRecorderRef.current && sttMediaRecorderRef.current.state !== "inactive") {
        sttMediaRecorderRef.current.stop();
      }
      setIsSttRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = selectedLanguage || "en-IN";

        recognition.onstart = () => {
          setIsSttRecording(true);
        };

        recognition.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const currentText = finalTranscript || interimTranscript;
          if (currentText) {
            setMessageText((prev) => {
              const base = prev ? prev.trim() + " " : "";
              return base + currentText;
            });
          }
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition error:", event.error);
          setIsSttRecording(false);
        };

        recognition.onend = () => {
          setIsSttRecording(false);
        };

        sttSpeechRecognitionRef.current = recognition;
        recognition.start();
        return;
      } catch (err) {
        console.warn("Web Speech API start error, falling back to Sarvam STT:", err);
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      sttMediaRecorderRef.current = mediaRecorder;
      sttAudioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          sttAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(sttAudioChunksRef.current, { type: "audio/wav" });
        if (audioBlob.size > 1000) {
          setIsSttTranscribing(true);
          try {
            const transcript = await transcribeAudioWithSarvam(audioBlob, selectedLanguage || "unknown");
            if (transcript) {
              setMessageText((prev) => (prev ? `${prev} ${transcript}` : transcript));
            }
          } catch (err: any) {
            toast.error("Failed to transcribe voice recording.");
          } finally {
            setIsSttTranscribing(false);
          }
        }
      };

      mediaRecorder.start(250);
      setIsSttRecording(true);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      toast.error("Could not access microphone.");
    }
  };

  const handleSendMessage = async () => {
    const phoneNumber = activePhoneNumber || lastCallNumber;
    const textToSend = sendTranslated && translatedText ? translatedText : messageText;

    if (!textToSend.trim() || !phoneNumber) {
      return;
    }

    setIsSendingMessage(true);
    try {
      const sanitizedNumber = phoneNumber.replace(/^(\+?91)/, "");
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
    if (!messageText.trim()) {
      toast.error("Please enter a message to translate");
      return;
    }

    const targetLanguage = selectedLanguage;
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
      toast.error(`Failed to translate: ${err.message || "Unknown error"}`);
    } finally {
      setTranslating(false);
    }
  };

  const currentPhoneNumber = activePhoneNumber || lastCallNumber || null;
  const isOutboundCall = activeCall?.direction === "outbound";
  const farmerDisplayName = extractedFarmerProfile?.farmerName
    ? `${extractedFarmerProfile.farmerName} (Farmer)`
    : currentPhoneNumber
      ? "Farmer"
      : "No active caller";

  return (
    <div
      ref={telephonyPanelRef}
      className={cn(
        "rounded-xl transition-all duration-300 relative border border-zinc-200/60 dark:border-zinc-800/70 bg-white/90 dark:bg-zinc-950/80 backdrop-blur-md shadow-md overflow-hidden",
        callStatus === "incoming" && "ring-2 ring-amber-500/50 shadow-amber-500/10 animate-pulse",
        callStatus === "calling" && "ring-2 ring-sky-500/50 shadow-sky-500/10",
        callStatus === "connected" && "ring-1 ring-emerald-500/40 shadow-emerald-500/5",
        callStatus === "held" && "ring-1 ring-yellow-500/40"
      )}
    >
      <div className="px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          {/* Left Section: Icon + Status + Phone + Farmer */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "w-10 h-10 sm:w-11 sm:h-11 rounded-2xl shrink-0 flex items-center justify-center shadow-inner transition-all",
                callStatus === "connected"
                  ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                  : callStatus === "calling"
                    ? "bg-sky-500/20 text-sky-500 border border-sky-500/40 animate-pulse"
                    : callStatus === "incoming"
                      ? "bg-amber-500/20 text-amber-500 border border-amber-500/40 animate-bounce"
                      : callStatus === "held"
                        ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/40"
                        : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-400 border border-zinc-200 dark:border-zinc-700/60"
              )}
            >
              {callStatus === "calling" ? (
                <PhoneCall className="h-4.5 w-4.5 sm:h-5 sm:w-5 animate-pulse" />
              ) : (
                <Phone className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                {/* Status Indicator */}
                {callStatus === "connected" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-emerald-600 dark:text-emerald-400">
                    CALL ACTIVE
                    <span className="flex items-end gap-0.5 h-2.5">
                      <span className="w-0.5 h-1.5 bg-emerald-500 animate-pulse rounded-full" />
                      <span className="w-0.5 h-2.5 bg-emerald-500 animate-pulse delay-75 rounded-full" />
                      <span className="w-0.5 h-1 bg-emerald-500 animate-pulse delay-150 rounded-full" />
                    </span>
                  </span>
                ) : callStatus === "calling" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-sky-600 dark:text-sky-400 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                    DIALING OUTBOUND...
                  </span>
                ) : callStatus === "incoming" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-amber-600 dark:text-amber-400 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    INCOMING CALL
                  </span>
                ) : callStatus === "held" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase text-yellow-600 dark:text-yellow-400">
                    <Pause className="w-2.5 h-2.5" />
                    ON HOLD
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold tracking-widest uppercase text-zinc-400 dark:text-zinc-500">
                    {lastCallNumber ? "CONCLUDED" : "STANDBY"}
                  </span>
                )}

                {/* Farmer Subtitle inline */}
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[140px] sm:max-w-[200px]">
                  • {farmerDisplayName}
                </span>
              </div>

              {/* Main Phone Number */}
              <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight font-mono truncate leading-tight mt-0.5">
                {currentPhoneNumber || "No Active Call"}
              </h2>
            </div>
          </div>

          {/* Middle Section: Stats Badges */}
          <div className="flex items-center gap-4 sm:gap-6 py-1.5 md:py-0 md:px-5 border-t md:border-t-0 md:border-x border-zinc-200/50 dark:border-zinc-800/50">
            {/* Stat 1: Duration */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 leading-none">
                  Duration
                </span>
                <span className="text-xs sm:text-sm font-bold font-mono text-zinc-800 dark:text-zinc-200 leading-tight mt-0.5">
                  {formatTimer(displayTimerSeconds)}
                </span>
              </div>
            </div>

            {/* Stat 2: Status */}
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 leading-none">
                  Status
                </span>
                <span
                  className={cn(
                    "text-xs sm:text-sm font-bold capitalize leading-tight mt-0.5",
                    callStatus === "connected" && "text-emerald-600 dark:text-emerald-400",
                    callStatus === "calling" && "text-sky-600 dark:text-sky-400 animate-pulse",
                    callStatus === "incoming" && "text-amber-600 dark:text-amber-400 animate-pulse",
                    callStatus === "held" && "text-yellow-600 dark:text-yellow-400",
                    callStatus === "ended" && "text-zinc-500 dark:text-zinc-400",
                    callStatus === "idle" && "text-zinc-400 dark:text-zinc-500"
                  )}
                >
                  {callStatus === "connected"
                    ? "Connected"
                    : callStatus === "calling"
                      ? "Calling..."
                      : callStatus === "incoming"
                        ? "Ringing"
                        : callStatus === "held"
                          ? "On Hold"
                          : callStatus === "ended"
                            ? "Ended"
                            : "Idle"}
                </span>
              </div>
            </div>

            {/* Stat 3: Direction */}
            <div className="flex items-center gap-2">
              {isOutboundCall ? (
                <ArrowUpRight className="w-4 h-4 text-sky-500 shrink-0" />
              ) : (
                <ArrowDownLeft className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
              )}
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 leading-none">
                  Direction
                </span>
                <span
                  className={cn(
                    "text-xs sm:text-sm font-bold leading-tight mt-0.5",
                    isOutboundCall ? "text-sky-600 dark:text-sky-400" : "text-zinc-700 dark:text-zinc-300"
                  )}
                >
                  {isOutboundCall ? "Outbound" : "Inbound"}
                </span>
              </div>
            </div>
          </div>

          {/* Right Section: Action Buttons */}
          <div className="flex items-center flex-wrap gap-2 shrink-0 justify-end">
            {callStatus === "incoming" && (
              <>
                <Button
                  onClick={answerCall}
                  size="sm"
                  className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Phone className="h-4 w-4" />
                  <span>Answer</span>
                </Button>
                <Button
                  onClick={rejectCall}
                  size="sm"
                  variant="destructive"
                  className="h-9 px-4 font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-red-500/20 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <PhoneOff className="h-4 w-4" />
                  <span>Reject</span>
                </Button>
              </>
            )}

            {callStatus === "calling" && (
              <Button
                onClick={hangupCall}
                size="sm"
                variant="destructive"
                className="h-9 px-4 font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-red-500/20 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <PhoneOff className="h-4 w-4" />
                <span>Cancel Call</span>
              </Button>
            )}

            {(callStatus === "connected" || callStatus === "held") && (
              <>
                <Button
                  onClick={toggleRecording}
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-8.5 sm:h-9 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 border-zinc-300 dark:border-zinc-700 shadow-sm",
                    isRecording
                      ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/30 animate-pulse font-bold"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  )}
                  title={isRecording ? "Stop live transcript" : "Start live transcript"}
                >
                  <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>{isRecording ? "Stop Transcript" : "Transcript"}</span>
                </Button>

                <Button
                  onClick={toggleMute}
                  size="sm"
                  variant={isMuted ? "destructive" : "outline"}
                  className={cn(
                    "h-8.5 sm:h-9 px-3 rounded-xl text-xs sm:text-sm font-semibold border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 flex items-center gap-1.5 shadow-sm",
                    isMuted && "bg-orange-500/10 text-orange-500 border-orange-500/30 font-bold"
                  )}
                >
                  {isMuted ? (
                    <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-500 dark:text-zinc-400" />
                  )}
                  <span>{isMuted ? "Unmute" : "Mute"}</span>
                </Button>

                <Button
                  onClick={toggleHold}
                  size="sm"
                  variant="outline"
                  className="h-8.5 sm:h-9 px-3 rounded-xl text-xs sm:text-sm font-semibold border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 flex items-center gap-1.5 shadow-sm"
                >
                  {callStatus === "held" ? (
                    <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-500 dark:text-zinc-400" />
                  ) : (
                    <Pause className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-zinc-500 dark:text-zinc-400" />
                  )}
                  <span>{callStatus === "held" ? "Resume" : "Hold"}</span>
                </Button>

                <Button
                  onClick={hangupCall}
                  size="sm"
                  variant="destructive"
                  className="h-8.5 sm:h-9 px-3.5 rounded-xl text-xs sm:text-sm font-bold bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20 flex items-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <PhoneOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>End Call</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant={isMessageExpanded ? "default" : "outline"}
                  onClick={() => setIsMessageExpanded((prev) => !prev)}
                  className="h-8.5 sm:h-9 px-3 rounded-xl text-xs sm:text-sm font-semibold gap-1.5 border-zinc-300 dark:border-zinc-700 shadow-sm"
                  title="Toggle SMS Follow-up"
                >
                  <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>SMS</span>
                  {isMessageExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              </>
            )}

            {(callStatus === "idle" || callStatus === "ended") && (
              <div className="flex items-center gap-2">
                {lastCallNumber && (
                  <Button
                    type="button"
                    size="sm"
                    variant={isMessageExpanded ? "default" : "outline"}
                    onClick={() => setIsMessageExpanded((prev) => !prev)}
                    className="h-8.5 sm:h-9 px-3.5 rounded-xl text-xs sm:text-sm font-semibold gap-1.5 shadow-sm"
                  >
                    <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>{isMessageExpanded ? "Hide SMS" : "Follow-up SMS"}</span>
                    {isMessageExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expandable SMS Follow-up Drawer */}
        {isMessageExpanded && (
          <div className="mt-2.5 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
                <span>Follow-up SMS {currentPhoneNumber ? `to ${currentPhoneNumber}` : ""}</span>
              </div>
              {translatedText && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-translated-active"
                    checked={sendTranslated}
                    onCheckedChange={setSendTranslated}
                  />
                  <label
                    htmlFor="show-translated-active"
                    className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer"
                  >
                    Show translated
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
                placeholder="Type your SMS message..."
                className="flex-1 px-3 py-1.5 text-xs border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-primary/50 shadow-inner"
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
                  "px-2.5 h-8 rounded-lg border-zinc-300 dark:border-zinc-700 transition-all font-semibold text-xs gap-1",
                  isSttRecording && "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse"
                )}
                title={isSttRecording ? "Stop recording" : "Voice-to-Text"}
              >
                {isSttTranscribing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : isSttRecording ? (
                  <MicOff className="h-3.5 w-3.5 text-red-500 animate-bounce" />
                ) : (
                  <Mic className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />
                )}
              </Button>
              <Button
                onClick={handleSendMessage}
                disabled={!(sendTranslated && translatedText ? translatedText : messageText).trim() || isSendingMessage || !currentPhoneNumber}
                size="sm"
                className="px-3.5 h-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-bold text-xs rounded-lg shrink-0 gap-1 transition-all"
              >
                <Send className="h-3 w-3" />
                <span>Send</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Target Language:
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => {
                    setSelectedLanguage(e.target.value);
                    setLanguageManuallyChanged(true);
                  }}
                  className="px-2 py-0.5 text-xs border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                className="gap-1 h-6.5 text-[11px] rounded-md px-2"
              >
                {translating && (
                  <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                )}
                <Languages className="h-2.5 w-2.5" />
                <span>Translate</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Call Control Box when scrolled away from Telephony Panel */}
      {isFloatingBoxVisible && (callStatus === "connected" || callStatus === "held" || callStatus === "calling") && (
        <div className="fixed bottom-6 left-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 shadow-2xl rounded-2xl p-2.5 px-3.5 flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  {currentPhoneNumber || "Active Call"}
                </span>
                <span className="text-[9px] text-zinc-400 font-mono">
                  {formatTimer(callTimerSeconds)} • {callStatus}
                </span>
              </div>
            </div>

            <div className="h-5 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

            <div className="flex items-center gap-1.5">
              {callStatus !== "calling" && (
                <>
                  <Button
                    onClick={toggleRecording}
                    size="sm"
                    variant="outline"
                    className={cn(
                      "h-7 text-xs font-semibold px-2 rounded-md transition-all",
                      isRecording
                        ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/30 animate-pulse font-bold"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    )}
                    title={isRecording ? "Stop Transcript" : "Start Transcript"}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    <span>{isRecording ? "Stop" : "Transcript"}</span>
                  </Button>

                  <Button
                    onClick={toggleMute}
                    size="sm"
                    variant={isMuted ? "destructive" : "outline"}
                    className={cn(
                      "h-7 text-xs px-2 font-semibold rounded-md",
                      isMuted && "bg-orange-500/10 text-orange-500 border-orange-500/30"
                    )}
                    title={isMuted ? "Unmute Agent" : "Mute Agent"}
                  >
                    {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                  </Button>

                  <Button
                    onClick={toggleHold}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2 font-semibold rounded-md border-zinc-300 dark:border-zinc-800"
                    title={callStatus === "held" ? "Resume Call" : "Hold Call"}
                  >
                    {callStatus === "held" ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  </Button>
                </>
              )}

              <Button
                onClick={hangupCall}
                size="sm"
                variant="destructive"
                className="h-7 text-xs px-2.5 rounded-md font-bold bg-red-600 hover:bg-red-700 text-white"
                title="Hang Up Call"
              >
                <PhoneOff className="h-3 w-3 mr-1" />
                <span>End</span>
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Hidden audio elements for Plivo WebRTC audio handling */}
      <audio id="plivo-audio-remote" autoPlay style={{ display: "none" }} />
      <audio id="plivo-audio-ringtone" autoPlay style={{ display: "none" }} />
    </div>
  );
};

export default IncomingCallBox;
