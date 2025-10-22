import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  HelpCircle,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Speech,
  User,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import toast from "react-hot-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./atoms/select";
import type { SupportedLanguage } from "@/types";
import { useSubmitTranscript } from "@/hooks/api/context/useSubmitTranscript";
import { ScrollArea, ScrollBar } from "./atoms/scroll-area";
import { Label } from "./atoms/label";
import { useGenerateQuestion } from "@/hooks/api/question/useGenerateQuestion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./atoms/accordion";
import { Skeleton } from "./atoms/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";
import { useSendAudioChunk } from "@/hooks/api/context/useSendAudioChunk";

export interface GeneratedQuestion {
  id: string;
  question: string;
  agri_specialist: string;
  answer: string;
}
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}
const supportedLanguages: {
  code: SupportedLanguage | "auto";
  label: string;
}[] = [
  { code: "auto", label: "Auto Detection" },
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "te-IN", label: "Telugu" },
  { code: "mr-IN", label: "Marathi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ur-IN", label: "Urdu" },
  { code: "as-IN", label: "Assamese" },
  { code: "brx-IN", label: "Bodo" },
  { code: "doi-IN", label: "Dogri" },
  { code: "kok-IN", label: "Konkani" },
  { code: "ks-IN", label: "Kashmiri" },
  { code: "mai-IN", label: "Maithili" },
  { code: "mni-IN", label: "Manipuri" },
  { code: "ne-IN", label: "Nepali" },
  { code: "sa-IN", label: "Sanskrit" },
  { code: "sat-IN", label: "Santali" },
  { code: "sd-IN", label: "Sindhi" },
];

export const VoiceRecorderCard = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState(``);
  const [isListening, setIsListening] = useState(false);
  const [language, setLanguage] = useState<SupportedLanguage>("auto");
  const [isLoadingRemainingTranscript, setIsLoadingRemainingTranscript] =
    useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const [frequencyData, setFrequencyData] = useState<number[]>([]);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // const transcriptRef = useRef("");
  const lastTranscriptRef = useRef("");
  // const frequencyRef = useRef<number[]>([]);
  const chunkBlobRef = useRef<Blob | null>(null);
  const isRecordingRef = useRef(false);
  const tempChunksRef = useRef<Blob[]>([]); // store chunks for current recording

  const { mutateAsync: submitTranscript, isPending } = useSubmitTranscript();

  const { mutateAsync: generateQuestions, isPending: isGeneratingQuestions } =
    useGenerateQuestion();

  const { mutateAsync: sendAudioChunk } = useSendAudioChunk();

  const sendChunkToBackend = async (
    chunk: Blob,
    lang: SupportedLanguage
  ): Promise<string> => {
    try {
      const file = new File([chunk], `audio-${Date.now()}.webm`, {
        type: chunk.type,
      });
      const result = await sendAudioChunk({ file, lang });
      return result?.transcript || "";
    } catch (err) {
      console.error("Failed to send audio:", err);
      return "";
    }
  };

  useEffect(() => {
    if (!isRecording) return;
    if (!transcript || transcript.trim().length <= 10) return;

    // Avoid generating questions if transcript hasn’t changed
    if (transcript === lastTranscriptRef.current) return;
    lastTranscriptRef.current = transcript;

    const generate = async () => {
      try {
        const qstns = await generateQuestions(transcript);
        setQuestions(qstns || []);
      } catch (err) {
        console.error("Error generating questions:", err);
      }
    };

    generate();
  }, [transcript, isRecording, isListening, generateQuestions]);

  const updateFrequency = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const bars = Array.from(dataArray).map((v) => v / 255);
    setFrequencyData(bars);
    animationFrameRef.current = requestAnimationFrame(updateFrequency);
  };

  const handleRecording = async (action: "start" | "stop") => {
    if (action === "start") {
      try {
        chunkBlobRef.current = null;
        tempChunksRef.current = [];

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        mediaStreamRef.current = stream;

        // --- Audio Visualization Setup ---
        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; // number of frequency bins
        source.connect(analyser);
        analyserRef.current = analyser;

        // start updating frequency data
        updateFrequency();

        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) tempChunksRef.current.push(event.data);
        };

        recorder.start();
        console.log("🎙️ Recording started");
      } catch (err) {
        console.error("Error starting recording:", err);
      }
    } else if (action === "stop") {
      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state === "inactive"
      ) {
        console.warn("No active recording to stop");
        return;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Stop the recorder and wait for onstop
      const blob = await new Promise<Blob | null>((resolve) => {
        const recorder = mediaRecorderRef.current!;
        recorder.onstop = () => {
          const combinedBlob = new Blob(tempChunksRef.current, {
            type: "audio/webm",
          });
          resolve(combinedBlob);

          // Cleanup
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
          }
          mediaRecorderRef.current = null;
          tempChunksRef.current = [];
        };

        recorder.stop();
        console.log("🛑 Recording stopped");
      });

      if (!blob) {
        console.warn("No blob recorded");
        return;
      }
      setIsLoadingRemainingTranscript(true);
      const result = await sendChunkToBackend(blob, language);
      setIsLoadingRemainingTranscript(false);
      setTranscript((prev) => prev + " " + result);
    }
  };

  const handleRecordingToggle = async () => {
    if (!isRecordingRef.current) {
      setIsRecording(true);
      isRecordingRef.current = true;

      const recordLoop = async () => {
        while (isRecordingRef.current) {
          await handleRecording("start");
          await new Promise((res) => setTimeout(res, 20000));
          await handleRecording("stop");
        }
      };

      recordLoop();
    } else {
      setIsRecording(false);
      isRecordingRef.current = false;
      handleRecording("stop");
    }
  };

  const handleSubmit = async () => {
    if (!transcript.trim()) {
      toast.error("Transcript is empty!");
      return;
    }

    try {
      await submitTranscript(transcript);
      setTranscript("");
      toast.success("Transcript submitted successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit transcript. Try again!");
    }
  };

  const handleClear = () => {
    setTranscript("");
    setIsRecording(false);
    setIsListening(false);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
    }
    setQuestions([]);
  };

  return (
    <div className="min-h-[75%] bg-background p-4 ">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="min-h-[80%] md:min-h-[75%] md:max-h-[75%]">
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Volume2 className="h-4 w-4 text-primary" />
                  </div>
                  Voice Recorder
                </CardTitle>
                <Select
                  value={language}
                  disabled
                  onValueChange={(value) =>
                    setLanguage(value as SupportedLanguage)
                  }
                  // disabled={isRecording || isListening}
                >
                  <SelectTrigger className="w-full md:w-[160px] h-9">
                    <Speech className="w-4 h-4" />
                    <span className="hidden md:block text-sm">
                      <SelectValue placeholder="Language" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 border rounded-lg bg-muted/30">
                <Button
                  onClick={() => handleRecordingToggle()}
                  size="sm"
                  variant={isRecording ? "destructive" : "default"}
                  className={cn(
                    "h-12 w-12 rounded-full flex-shrink-0 self-center sm:self-auto",
                    isRecording && "animate-pulse"
                  )}
                >
                  {isRecording ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>

                <div className="flex-1 flex items-center gap-1 h-8">
                  {isRecording ? (
                    <div className="w-[70%] h-full flex items-end overflow-hidden">
                      {frequencyData
                        .filter((_, index) => index % 4 === 0)
                        .map((level, index) => (
                          <div
                            key={index}
                            className="bg-gradient-to-t from-blue-500 to-purple-500 rounded-full w-1 transition-all duration-75"
                            style={{
                              height: `${Math.max(level * 100, 10)}%`,
                              opacity: 0.6 + level * 0.4,
                              marginRight: "4px",
                            }}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      {isRecording ? (
                        <>
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                          Recording...
                        </>
                      ) : (
                        "Click microphone to start"
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {transcript && !isRecording && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-xs font-medium">Done</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Transcript</Label>
                  {transcript.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {transcript.length} chars
                    </span>
                  )}
                </div>

                <div className="h-40 relative">
                  <div className="h-full w-full overflow-y-auto rounded-md border bg-background/50 p-3 text-sm whitespace-pre-wrap break-words">
                    {!transcript ? (
                      <span className="text-muted-foreground">
                        Your speech will appear here...
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {transcript || ""}
                        {isLoadingRemainingTranscript && (
                          <span className="flex items-center gap-1">
                            <Loader2 className="w-4 h-4 animate-spin" />{" "}
                            Loading...
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex flex-wrap justify-end mt-2 gap-2">
                  <Button
                    onClick={handleClear}
                    variant="outline"
                    size="sm"
                    disabled={!transcript || isRecording}
                    className="flex items-center gap-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Clear</span>
                  </Button>

                  <Button
                    onClick={handleSubmit}
                    disabled={!transcript || isPending || isRecording}
                    size="sm"
                    className="flex items-center gap-1 shadow-sm"
                  >
                    <Send className="h-3 w-3" />
                    <span className="text-xs">
                      {isPending ? "Sending..." : "Submit"}
                    </span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[80%]  md:min-h-[75%] md:max-h-[75%]">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <HelpCircle className="h-5 w-5 text-primary" />
                      </div>
                      Questions
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    These are questions generated from your transcript
                  </TooltipContent>
                </Tooltip>
                <Badge variant="outline">{questions?.length} questions</Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className=" h-full overflow-hidden">
              {isGeneratingQuestions ? (
                <div className="flex flex-col h-[500px] text-center text-muted-foreground space-y-4 p-4">
                  <Skeleton className="h-25 w-full rounded-md" />
                  <Skeleton className="h-25 w-full rounded-md" />
                  <Skeleton className="h-25 w-full rounded-md" />
                </div>
              ) : (
                <ScrollArea className="h-[500px] w-full ">
                  {!questions || questions?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
                      <Lightbulb className="h-12 w-12 mb-4 opacity-50" />
                      <p className="text-sm">
                        Start speaking to related questions based on your
                        transcript
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 pb-28">
                      {questions?.map((qn, index) => (
                        <div
                          key={`${qn.question}-${qn.id + index}`}
                          className="rounded-lg border bg-card hover:bg-accent/30 transition-colors overflow-hidden"
                        >
                          <div className="p-4">
                            <div className="flex items-start gap-3 mb-3">
                              <div className="text-blue-600 dark:text-blue-400 mt-1">
                                <HelpCircle className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground leading-relaxed">
                                  {qn.question}
                                </p>
                              </div>
                            </div>

                            <Accordion
                              type="single"
                              collapsible
                              className="w-full"
                            >
                              <AccordionItem
                                value="answer"
                                className="border-none"
                              >
                                <AccordionTrigger className="py-2 px-3 bg-muted/50 rounded-md hover:bg-muted transition-colors text-sm font-medium hover:no-underline">
                                  <div className="flex items-center gap-2">
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    View Expert Answer
                                  </div>
                                </AccordionTrigger>

                                <AccordionContent className="pt-3 pb-1">
                                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
                                    <div className="flex justify-between items-center w-full px-2">
                                      <div className="flex items-center gap-2">
                                        <svg
                                          className="w-4 h-4 text-green-600 dark:text-green-400"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                          />
                                        </svg>
                                        <span className="text-sm font-medium text-green-800 dark:text-green-200">
                                          Specialist Answer
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <User className="w-3 h-3" />
                                        <span className="font-medium">
                                          Specialist:
                                        </span>
                                        <span className="font-medium text-foreground">
                                          {qn.agri_specialist}
                                        </span>
                                      </div>
                                    </div>

                                    <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed px-2">
                                      {qn.answer || "Nil"}
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

              {(questions?.length || 0) > 0 && (
                <div className="text-center text-sm text-muted-foreground border-t pt-4 mt-4">
                  <p>Questions are generated live as you speak</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VoiceRecorderCard;
