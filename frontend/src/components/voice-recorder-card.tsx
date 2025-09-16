import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Edit3,
  Filter,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import { Textarea } from "./atoms/textarea";
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

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}
const supportedLanguages: { code: SupportedLanguage; label: string }[] = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (US)" },
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
];

const VoiceRecorderCard = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("en-IN");

  const [isEditing, setIsEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const [frequencyData, setFrequencyData] = useState<number[]>([]);

  const recognitionRef = useRef<any>(null);

  const { mutateAsync: submitTranscript, isPending } = useSubmitTranscript();

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            setTranscript((prev) => prev + " " + result[0].transcript);
          } else {
            interim += result[0].transcript;
          }
        }
        setInterimTranscript(interim);
      };

      recognition.onend = () => setIsListening(false);
      recognition.onerror = (event: any) => console.error(event.error);

      recognitionRef.current = recognition;
    } else {
      toast.error("Web Speech API is not supported in this browser.");
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [language]);

  const handleRecordingToggle = async () => {
    if (isRecording) {
      setIsRecording(false);
      setIsListening(false);

      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((track) => track.stop());
      }

      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        source.connect(analyserRef.current);

        updateAudioLevel();

        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.start();

        if (recognitionRef.current) {
          recognitionRef.current.start();
        }

        setIsRecording(true);
        setIsListening(true);
        setInterimTranscript("");
      } catch (error) {
        console.error("Error accessing microphone:", error);
      }
    }
  };

  const updateAudioLevel = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);

      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);

      const frequencyBars = Array.from(dataArray.slice(0, 16)).map(
        (value) => value / 255
      );
      setFrequencyData(frequencyBars);
    }
  };

  const handleClear = () => {
    setTranscript("");
    setIsRecording(false);
    setIsListening(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedTranscript(transcript);
  };

  const handleSaveEdit = () => {
    setTranscript(editedTranscript);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedTranscript("");
    setIsEditing(false);
  };

  const handleSubmit = async () => {
    const finalText = isEditing ? editedTranscript : transcript;

    if (!finalText.trim()) {
      toast.error("Transcript is empty!");
      return;
    }

    try {
      await submitTranscript(finalText);
      toast.success("Transcript submitted successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit transcript. Try again!");
    }
  };

  const displayTranscript =
    transcript + (interimTranscript ? " " + interimTranscript : "");

  return (
    <div className="min-h-screen bg-gradient-to-br md:p-4 ">
      <div className="max-w-8xl mx-auto">
        {/* Use responsive grid: 1 column on mobile, 2 columns on lg */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {/* Voice Recorder Card */}
          <Card className="w-full">
            <CardHeader className="text-center">
              <div className="flex justify-between items-center w-full gap-2">
                {/* Title always visible */}
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5" />
                  Voice Recorder
                </CardTitle>

                {/* Single responsive Select */}
                <Select
                  value={language}
                  onValueChange={(value) =>
                    setLanguage(value as SupportedLanguage)
                  }
                  disabled={isRecording || isListening}
                >
                  <SelectTrigger className="flex items-center w-fit justify-center  md:w-[200px] p-2 ">
                    <Filter className="w-5 h-5 md:hidden mx-auto" />
                    <span className="hidden md:block">
                      <SelectValue placeholder="Select language" />
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

            <CardContent className="space-y-6">
              {/* Recording Button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleRecordingToggle}
                  size="lg"
                  variant={isRecording ? "destructive" : "default"}
                  className={cn(
                    "h-24 w-24 rounded-full transition-all duration-300 shadow-lg",
                    isRecording && "animate-pulse shadow-red-200"
                  )}
                >
                  {isRecording ? (
                    <MicOff className="h-10 w-10" />
                  ) : (
                    <Mic className="h-10 w-10" />
                  )}
                </Button>
              </div>

              {/* Audio visualization */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-end justify-center gap-1 h-16 rounded-lg p-2">
                    {isRecording && isListening ? (
                      frequencyData.map((level, index) => (
                        <div
                          key={index}
                          className="bg-gradient-to-t from-blue-500 to-purple-500 rounded-sm transition-all duration-75 min-w-[3px]"
                          style={{
                            height: `${Math.max(level * 100, 2)}%`,
                            opacity: 0.7 + level * 0.3,
                          }}
                        />
                      ))
                    ) : (
                      <div className="flex justify-center">
                        <Badge variant="secondary">Ready</Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer text */}
              <div className="text-center text-sm text-muted-foreground border-t pt-4">
                <p className="mb-2">Click the microphone to start recording</p>
                <p>Speak clearly for best transcription results</p>
              </div>
            </CardContent>
          </Card>

          {/* Transcription Card */}
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Edit3 className="h-5 w-5" />
                  Transcription
                </span>
                <div className="text-xs text-muted-foreground">
                  {displayTranscript.length > 0 &&
                    `${displayTranscript.length} characters`}
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {isEditing ? "Edit Transcript" : "Live Transcript"}
                </label>
                {isEditing ? (
                  <Textarea
                    value={editedTranscript}
                    onChange={(e) => setEditedTranscript(e.target.value)}
                    placeholder="Edit your transcript here..."
                    className="min-h-40 max-h-40 resize-none overflow-y-auto w-full"
                  />
                ) : (
                  <Textarea
                    value={displayTranscript}
                    placeholder="Your speech will appear here..."
                    className="min-h-40 max-h-40 resize-none overflow-y-auto w-full"
                    disabled={isRecording || !isEditing}
                    readOnly={!isEditing}
                  />
                )}
              </div>

              <div className="flex flex-wrap gap-2 justify-between">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={handleClear}
                    variant="outline"
                    size="sm"
                    disabled={!displayTranscript && !isRecording}
                    className="flex items-center gap-2 bg-transparent"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Clear
                  </Button>

                  {!isEditing ? (
                    <Button
                      onClick={handleEdit}
                      variant="outline"
                      size="sm"
                      disabled={!transcript}
                      className="flex items-center gap-2 bg-transparent"
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={handleSaveEdit}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 bg-transparent"
                      >
                        Save
                      </Button>
                      <Button
                        onClick={handleCancelEdit}
                        variant="ghost"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={
                    (!displayTranscript && !editedTranscript) || isPending
                  }
                  className="flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  {isPending ? "Submitting..." : "Submit"}
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground border-t pt-4">
                {isRecording ? (
                  <div className="flex items-center gap-2 text-red-600 font-medium justify-center">
                    <Mic className="w-5 h-5 animate-pulse" />
                    <span>Recording in progress...</span>
                  </div>
                ) : transcript ? (
                  <div className="flex items-center gap-2 text-green-600 font-medium justify-center">
                    <CheckCircle className="w-5 h-5" />
                    <span>
                      Transcription complete. You can review or edit below.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500 justify-center">
                    <span>Click start to begin recording</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VoiceRecorderCard;
