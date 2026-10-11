import { useEffect, useRef, useState, useCallback } from "react";
import {
  CheckCircle,
  HelpCircle,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Square,
  Volume2,
  VolumeX,
  Languages,
  User,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import { Textarea } from "./atoms/textarea";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import { ScrollArea, ScrollBar } from "./atoms/scroll-area";
import { Label } from "./atoms/label";
import { Switch } from "./atoms/switch";
import { useGenerateQuestion } from "@/hooks/api/question/useGenerateQuestion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import { Skeleton } from "./atoms/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import { FarmerAvatar, type AvatarState } from "./farmer-avatar";

export interface GeneratedQuestion {
  id: string;
  question: string;
  agri_specialist: string;
  answer: string;
  referenceSource: string;
}

export interface VoiceRecorderCardProps {}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export interface LanguageConfig {
  code: string;
  name: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { code: "en-IN", name: "English", label: "English (India)" },
  { code: "kn-IN", name: "Kannada", label: "ಕನ್ನಡ (Kannada)" },
  { code: "hi-IN", name: "Hindi", label: "हिन्दी (Hindi)" },
  { code: "te-IN", name: "Telugu", label: "తెలుగు (Telugu)" },
  { code: "ta-IN", name: "Tamil", label: "தமிழ் (Tamil)" },
  { code: "mr-IN", name: "Marathi", label: "मराठी (Marathi)" },
  { code: "bn-IN", name: "Bengali", label: "বাংলা (Bengali)" },
  { code: "gu-IN", name: "Gujarati", label: "ગુજરાતી (Gujarati)" },
];

export const VoiceRecorderCard = ({}: VoiceRecorderCardProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [inputLangCode, setInputLangCode] = useState("en-IN");
  const [answerLangCode, setAnswerLangCode] = useState("en-IN");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>("IDLE");
  const [errorMessage, setErrorMessage] = useState("");
  const [frequencyData, setFrequencyData] = useState<number[]>([]);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Refs for Web Speech & Web Audio APIs
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const transcriptRef = useRef<string>(transcript);
  const baseTranscriptRef = useRef<string>("");

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const { mutateAsync: generateQuestions, isPending: isGeneratingQuestions } =
    useGenerateQuestion();

  // Load available speech synthesis voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Synchronize thinking avatar state with React Query mutation
  useEffect(() => {
    if (isGeneratingQuestions) {
      setAvatarState("THINKING");
    } else if (avatarState === "THINKING" && !isSpeaking) {
      setAvatarState("IDLE");
    }
  }, [isGeneratingQuestions, isSpeaking, avatarState]);

  // Clean stop for audio visualizer
  const stopAudioVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setFrequencyData([]);
  }, []);

  // Start real-time audio visualization
  const startAudioVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateFrequency = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const bars = Array.from(dataArray).map((v) => v / 255);
        setFrequencyData(bars);
        animationFrameRef.current = requestAnimationFrame(updateFrequency);
      };

      updateFrequency();
    } catch (err) {
      console.warn("Could not start visualizer frequency stream:", err);
    }
  };

  // Stop current speech playback
  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    currentUtteranceRef.current = null;
    setIsSpeaking(false);
    setAvatarState((prev) => (prev === "SPEAKING" ? "IDLE" : prev));
  }, []);

  // Speak a generated answer aloud
  const speakAnswer = useCallback(
    (text: string, langCode: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        toast.error("Text-to-speech is not supported in this browser.");
        return;
      }

      // Stop any existing speech session first
      stopSpeaking();

      // Clean text of markdown formatting for natural speech
      const cleaned = text
        .replace(/```[\s\S]*?```/g, "")
        .replace(/[*_~`#>-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      currentUtteranceRef.current = utterance;
      utterance.lang = langCode;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Match best available voice
      const voices = availableVoices.length ? availableVoices : window.speechSynthesis.getVoices();
      const targetPrefix = langCode.slice(0, 2).toLowerCase();
      const matchedVoice =
        voices.find((v) => v.lang.toLowerCase() === langCode.toLowerCase()) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(targetPrefix)) ||
        voices.find((v) => v.lang.includes("IN") && v.lang.toLowerCase().includes(targetPrefix));

      if (matchedVoice) {
        utterance.voice = matchedVoice;
      } else {
        console.warn(`No native speech voice found for ${langCode}, using system fallback.`);
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setAvatarState("SPEAKING");
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setAvatarState("IDLE");
        currentUtteranceRef.current = null;
      };

      utterance.onerror = (e) => {
        // Only log if not explicitly cancelled
        if ((e as any).error !== "canceled" && (e as any).error !== "interrupted") {
          console.warn("Speech synthesis notice:", e);
        }
        setIsSpeaking(false);
        setAvatarState("IDLE");
        currentUtteranceRef.current = null;
      };

      window.speechSynthesis.speak(utterance);
    },
    [availableVoices, stopSpeaking]
  );

  // Stop speech recognition
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors if already stopping
      }
      recognitionRef.current = null;
    }
    stopAudioVisualization();
    setIsRecording(false);
    setAvatarState((prev) => (prev === "LISTENING" ? "IDLE" : prev));
  }, [stopAudioVisualization]);

  // Start speech recognition
  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error(
        "Speech Recognition is not supported in this browser. Please type your query in the transcript box."
      );
      setErrorMessage("Speech not supported in browser");
      setAvatarState("ERROR");
      setTimeout(() => setAvatarState("IDLE"), 3500);
      return;
    }

    // Stop speaking before listening
    stopSpeaking();

    // Snapshot existing transcript so newly recorded words append cleanly to existing text
    baseTranscriptRef.current = transcriptRef.current.trim();

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = inputLangCode;

      recognition.onstart = () => {
        setIsRecording(true);
        setAvatarState("LISTENING");
        startAudioVisualization();
      };

      recognition.onresult = (event: any) => {
        let sessionFinal = "";
        let sessionInterim = "";

        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || "";
          if (item.isFinal) {
            sessionFinal = sessionFinal ? `${sessionFinal} ${text.trim()}` : text.trim();
          } else {
            sessionInterim = sessionInterim ? `${sessionInterim} ${text.trim()}` : text.trim();
          }
        }

        const sessionText = [sessionFinal, sessionInterim].filter(Boolean).join(" ");
        const base = baseTranscriptRef.current;
        const fullTranscript = base
          ? (sessionText ? `${base} ${sessionText}` : base)
          : sessionText;

        setTranscript(fullTranscript);
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        stopAudioVisualization();
        setIsRecording(false);

        if (event.error === "not-allowed" || event.error === "permission-denied") {
          toast.error(
            "Microphone permission was denied. Please allow microphone access in your browser settings."
          );
          setErrorMessage("Mic permission denied");
          setAvatarState("ERROR");
        } else if (event.error === "no-speech") {
          setAvatarState("IDLE");
        } else {
          toast.error(`Microphone notice: ${event.error}`);
          setErrorMessage(`Mic notice: ${event.error}`);
          setAvatarState("ERROR");
        }
      };

      recognition.onend = () => {
        stopAudioVisualization();
        setIsRecording(false);
        setAvatarState((prev) => (prev === "LISTENING" ? "IDLE" : prev));
      };

      recognition.start();
    } catch (err: any) {
      console.error("Failed to start speech recognition:", err);
      toast.error("Could not start microphone: " + err.message);
      setErrorMessage("Microphone failed to start");
      setAvatarState("ERROR");
      stopAudioVisualization();
      setIsRecording(false);
    }
  }, [inputLangCode, stopSpeaking, stopAudioVisualization]);

  // Toggle recording button
  const handleRecordingToggle = () => {
    if (isRecording) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Submit question flow
  const handleSubmit = async () => {
    const queryText = transcript.trim();
    if (!queryText) {
      toast.error("Please enter or record a question before submitting.");
      return;
    }

    // Stop recording and speech
    if (isRecording) stopListening();
    stopSpeaking();

    const selectedLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === answerLangCode);
    const targetLanguageName = selectedLangObj?.name || "English";

    setAvatarState("THINKING");

    try {
      const qstns = await generateQuestions({
        transcript: queryText,
        language: targetLanguageName,
      });

      if (qstns && qstns.length > 0 && qstns.some((q) => q.answer)) {
        setQuestions(qstns);
        toast.success("Answer generated successfully!");

        const firstAnswer = qstns[0].answer;
        if (autoSpeak && firstAnswer) {
          // Brief delay before speaking for smooth transition
          setTimeout(() => {
            speakAnswer(firstAnswer, answerLangCode);
          }, 400);
        } else {
          setAvatarState("IDLE");
        }
        return;
      }

      // Empty response from backend
      toast.error("No answer received. Please try again.");
      setAvatarState("ERROR");
      setErrorMessage("No answer received");
    } catch (error: any) {
      console.error("Query submission error:", error);
      const isQuotaError =
        error?.message?.includes("429") ||
        error?.message?.toLowerCase().includes("quota") ||
        error?.message?.toLowerCase().includes("rate limit");

      if (isQuotaError) {
        toast.error(
          "Gemini API rate limit reached. Please wait a moment before asking again."
        );
        setErrorMessage("Rate limit reached. Please wait.");
      } else {
        toast.error(error?.message || "Failed to submit question. Please check network.");
        setErrorMessage("Request failed");
      }
      setAvatarState("ERROR");
    }
  };

  // Clear all fields
  const handleClear = () => {
    if (isRecording) stopListening();
    stopSpeaking();
    baseTranscriptRef.current = "";
    setTranscript("");
    setQuestions([]);
    setAvatarState("IDLE");
    setErrorMessage("");
  };

  // Check if speech synthesis voice is available for answer language
  const hasVoiceForAnswerLang = availableVoices.some((v) =>
    v.lang.toLowerCase().startsWith(answerLangCode.slice(0, 2).toLowerCase())
  );

  return (
    <div className="bg-background p-4">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: Voice Recorder & Farmer Avatar */}
          <Card className="min-h-[80%] md:h-auto border shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Volume2 className="h-5 w-5" />
                  </div>
                  <div>
                    <span>AjraSakha Voice Assistant</span>
                    <p className="text-xs font-normal text-muted-foreground mt-0.5">
                      Ask your farming questions by voice or text
                    </p>
                  </div>
                </CardTitle>

                {/* Auto-Speak Answers Toggle */}
                <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-lg border text-xs shadow-2xs">
                  <Switch
                    id="auto-speak"
                    checked={autoSpeak}
                    onCheckedChange={setAutoSpeak}
                  />
                  <Label htmlFor="auto-speak" className="cursor-pointer text-xs font-medium">
                    Auto-Speak
                  </Label>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-4">
              {/* Farmer Avatar Centerpiece */}
              <div className="flex flex-col items-center justify-center p-3 rounded-xl border bg-gradient-to-b from-muted/30 to-background shadow-xs">
                <FarmerAvatar
                  state={avatarState}
                  isSpeaking={isSpeaking}
                  errorMessage={errorMessage}
                  onAvatarClick={() => {
                    if (questions?.[0]?.answer) {
                      if (isSpeaking) stopSpeaking();
                      else speakAnswer(questions[0].answer, answerLangCode);
                    }
                  }}
                />
              </div>

              {/* Language Selection Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                    <Mic className="w-3.5 h-3.5 text-primary" />
                    Speech Input Language
                  </Label>
                  <Select
                    value={inputLangCode}
                    onValueChange={(val) => {
                      if (isRecording) stopListening();
                      setInputLangCode(val);
                    }}
                    disabled={isRecording}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Input Language" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code} className="text-xs">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                      <Languages className="w-3.5 h-3.5 text-primary" />
                      Answer Language
                    </Label>
                    {!hasVoiceForAnswerLang && (
                      <Badge variant="outline" className="text-[10px] h-4 py-0 text-amber-600 border-amber-300">
                        Text only
                      </Badge>
                    )}
                  </div>
                  <Select
                    value={answerLangCode}
                    onValueChange={(val) => {
                      stopSpeaking();
                      setAnswerLangCode(val);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Answer Language" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code} className="text-xs">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Voice Recording Control Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 border rounded-xl bg-card shadow-2xs">
                <Button
                  onClick={handleRecordingToggle}
                  size="icon"
                  variant={isRecording ? "destructive" : "default"}
                  className={cn(
                    "h-12 w-12 rounded-full flex-shrink-0 self-center sm:self-auto shadow-md transition-all duration-300",
                    isRecording && "animate-pulse ring-4 ring-destructive/20"
                  )}
                  title={isRecording ? "Stop recording speech" : "Start recording speech"}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                {/* Status & Frequency Equalizer */}
                <div className="flex-1 flex items-center gap-2 h-10 px-2">
                  {isRecording ? (
                    <div className="w-full flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      <span className="text-xs font-medium text-destructive mr-2">
                        Listening ({inputLangCode})...
                      </span>
                      {/* Audio frequency bars */}
                      <div className="flex-1 flex items-end gap-1 h-7 overflow-hidden">
                        {(frequencyData.length ? frequencyData : [0.2, 0.5, 0.8, 0.4, 0.7, 0.3])
                          .slice(0, 16)
                          .map((level, idx) => (
                            <div
                              key={idx}
                              className="bg-gradient-to-t from-emerald-500 to-teal-400 rounded-full w-1.5 transition-all duration-75"
                              style={{
                                height: `${Math.max(level * 100, 15)}%`,
                                opacity: 0.7 + level * 0.3,
                              }}
                            />
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <span>Click the microphone to speak your question</span>
                    </div>
                  )}
                </div>

                {/* State Tag */}
                <div className="flex-shrink-0 self-center">
                  {transcript && !isRecording && (
                    <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-md text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Ready</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Transcript Textarea Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Question Transcript (Editable)</Label>
                  {transcript.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {transcript.length} characters
                    </span>
                  )}
                </div>

                <div className="h-36 relative">
                  <Textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Your spoken words or typed question will appear here. Feel free to edit before submitting..."
                    className="h-full w-full resize-none bg-background/60 p-3 text-sm leading-relaxed border focus-visible:ring-1"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    {isSpeaking && (
                      <Button
                        onClick={stopSpeaking}
                        variant="secondary"
                        size="sm"
                        className="text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Square className="w-3.5 h-3.5 mr-1" />
                        Stop Speaking
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleClear}
                      variant="outline"
                      size="sm"
                      disabled={!transcript && !questions.length && !isRecording}
                      className="text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Clear
                    </Button>

                    <Button
                      onClick={handleSubmit}
                      disabled={!transcript.trim() || isGeneratingQuestions || isRecording}
                      size="sm"
                      className="text-xs shadow-xs"
                    >
                      {isGeneratingQuestions ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          <span>Generating Answer...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 mr-1" />
                          <span>Submit Question</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Column 2: Expert Answers & Speech Controls */}
          <Card className="min-h-[80%] md:h-auto border shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="flex items-center justify-between">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-2 text-base font-semibold">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                        <HelpCircle className="h-5 w-5" />
                      </div>
                      Agricultural Advisory Answers
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Detailed answers powered by Google Gemini and Package of Practices
                  </TooltipContent>
                </Tooltip>
                <Badge variant="outline" className="text-xs">
                  {questions?.length || 0} answer{questions?.length === 1 ? "" : "s"}
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="h-full pt-4">
              {isGeneratingQuestions ? (
                <div className="flex flex-col h-[480px] justify-center items-center text-muted-foreground space-y-4 p-6">
                  <div className="p-4 rounded-full bg-primary/10 text-primary animate-bounce">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <div className="space-y-2 text-center max-w-sm">
                    <p className="text-sm font-medium text-foreground">
                      AjraSakha is consulting the agricultural knowledge base...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Generating tailored advisory for your crop and region using Google Gemini
                    </p>
                  </div>
                  <div className="w-full max-w-md space-y-3 pt-4">
                    <Skeleton className="h-6 w-3/4 rounded" />
                    <Skeleton className="h-20 w-full rounded" />
                    <Skeleton className="h-16 w-full rounded" />
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-[480px] w-full pr-3">
                  {!questions || questions?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[380px] text-center text-muted-foreground px-4">
                      <div className="p-4 rounded-full bg-muted mb-3">
                        <Lightbulb className="h-10 w-10 opacity-60 text-amber-500" />
                      </div>
                      <h4 className="text-sm font-medium text-foreground mb-1">
                        No Questions Submitted Yet
                      </h4>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        Speak into the microphone or type your farming query to receive an instant,
                        spoken advisory from your AjraSakha assistant.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 pb-12">
                      {questions.map((qn, index) => (
                        <div
                          key={`${qn.id || index}-${qn.question}`}
                          className="rounded-xl border bg-card hover:border-primary/40 transition-all shadow-xs overflow-hidden"
                        >
                          <div className="p-4 space-y-3">
                            {/* Question Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 flex-1">
                                <div className="p-1 rounded-md bg-blue-500/10 text-blue-600 mt-0.5">
                                  <HelpCircle className="h-4 w-4" />
                                </div>
                                <p className="text-sm font-semibold text-foreground leading-snug">
                                  {qn.question}
                                </p>
                              </div>

                              {/* Speech Playback Controls */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {isSpeaking ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={stopSpeaking}
                                    className="h-8 px-2.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                    title="Stop speech"
                                  >
                                    <VolumeX className="w-3.5 h-3.5 mr-1" />
                                    Stop
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => speakAnswer(qn.answer, answerLangCode)}
                                    className="h-8 px-2.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
                                    title="Speak answer aloud"
                                  >
                                    <Volume2 className="w-3.5 h-3.5 mr-1" />
                                    Speak Answer
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Accordion / Content Area */}
                            <Accordion type="single" collapsible defaultValue="answer" className="w-full">
                              <AccordionItem value="answer" className="border-none">
                                <AccordionTrigger className="py-2 px-3 bg-muted/40 rounded-lg hover:bg-muted/70 transition-colors text-xs font-medium hover:no-underline">
                                  <div className="flex items-center gap-2">
                                    <User className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Specialist Advisory ({qn.agri_specialist})</span>
                                  </div>
                                </AccordionTrigger>

                                <AccordionContent className="pt-3 pb-1">
                                  <div className="bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                      <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                                        Verified Agricultural Advisory
                                      </span>
                                      <Badge variant="secondary" className="text-[11px] font-normal">
                                        Source: {qn.referenceSource || "Google Gemini"}
                                      </Badge>
                                    </div>

                                    {/* Spoken indicator */}
                                    {isSpeaking && (
                                      <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-primary/10 text-primary text-xs font-medium animate-pulse">
                                        <Volume2 className="w-3.5 h-3.5" />
                                        <span>Reading aloud now...</span>
                                      </div>
                                    )}

                                    {/* Full Text Answer */}
                                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                                      {qn.answer}
                                    </p>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VoiceRecorderCard;
