import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./atoms/card";
import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import { Textarea } from "./atoms/textarea";
import toast from "react-hot-toast";

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

const VoiceRecorderCard = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setIsListening(true);
        toast.success("Recording started...");
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
  }, []);

  const handleRecordingToggle = () => {
    if (!recognitionRef.current) return;
    try {
      if (isRecording) recognitionRef.current.stop();
      else recognitionRef.current.start();
      setIsRecording(!isRecording);
      setIsListening(!isRecording);
    } catch (error) {
      console.error("SpeechRecognition start error:", error);
      toast.error("Failed to start recognition. Check microphone permissions.");
      window.location.reload();
    }
  };

  const handleClear = () => {
    setTranscript("");
    setIsRecording(false);
    setIsListening(false);
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <Volume2 className="h-5 w-5" />
          Voice Recorder & Transcriber
        </CardTitle>
        <div className="flex justify-center">
          <Badge variant={isRecording ? "destructive" : "secondary"}>
            {isRecording ? "Recording..." : "Ready"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center my-4">
          <Button
            onClick={handleRecordingToggle}
            size="lg"
            variant={isRecording ? "destructive" : "default"}
            className={cn(
              "h-20 w-20 rounded-full transition-all duration-300",
              isRecording && "animate-pulse shadow-lg"
            )}
          >
            {isRecording ? (
              <MicOff className="h-8 w-8" />
            ) : (
              <Mic className="h-8 w-8" />
            )}
          </Button>
        </div>

        {isListening && (
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-destructive rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-destructive rounded-full animate-bounce delay-75" />
              <div className="w-2 h-2 bg-destructive rounded-full animate-bounce delay-150" />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Transcription
          </label>
          <Textarea
            // value={transcript}
            value={
              transcript + (interimTranscript ? " " + interimTranscript : "")
            }
            placeholder="Your speech will appear here..."
            className="min-h-32 resize-none"
            disabled={isRecording}
          />
        </div>

        <div className="flex justify-between items-center mt-2">
          <Button
            onClick={handleClear}
            variant="outline"
            size="sm"
            disabled={!transcript && !isRecording}
            className="flex items-center gap-2"
          >
            Clear
          </Button>
          <div className="text-xs text-muted-foreground">
            {transcript.length > 0 && `${transcript.length} characters`}
          </div>
        </div>

        <div className="text-center text-sm text-muted-foreground border-t pt-4 mt-4">
          Click the microphone to start recording. Speak clearly for best
          results.
        </div>
      </CardContent>
    </Card>
  );
};

export default VoiceRecorderCard;
