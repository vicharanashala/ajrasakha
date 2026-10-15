import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface VoiceRemarksInputProps {
    label?: string;
    value?: string;
    onChange: (val: string) => void;
    placeholder?: string;
    maxLength?: number;
    required?: boolean;
    error?: string;
    category?: string;
    disabled?: boolean;
    className?: string;
}

const SPEECH_LANGUAGE = "en-IN";

export const VoiceRemarksInput: React.FC<VoiceRemarksInputProps> = ({
    label = "Remarks Details",
    value = "",
    onChange,
    placeholder = "Speak using microphone or type your detailed remarks...",
    maxLength = 2000,
    required = false,
    error,
    category: _category,
    disabled = false,
    className,
}) => {
    const [isListening, setIsListening] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);
    const [interimTranscript, setInterimTranscript] = useState("");

    const recognitionRef = useRef<any>(null);
    const currentValueRef = useRef(value);
    const baseTextOnStartRef = useRef("");

    useEffect(() => {
        currentValueRef.current = value;
    }, [value]);

    // Check Web Speech API availability
    useEffect(() => {
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setSpeechSupported(false);
        }
    }, []);

    // Cleanup speech recognition on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch {
                    // Ignore error on unmount
                }
            }
        };
    }, []);

    const startListening = () => {
        if (!speechSupported) {
            toast.error("Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
            return;
        }

        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) return;

        try {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }

            // Snapshot existing textarea content before recording starts
            const baseText = (currentValueRef.current || "").trim();
            baseTextOnStartRef.current = baseText;

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = SPEECH_LANGUAGE;

            let finalAccumulated = "";

            recognition.onstart = () => {
                setIsListening(true);
                setInterimTranscript("");
                toast.info("Microphone active. Speak your remarks in English...");
            };

            recognition.onresult = (event: any) => {
                let interim = "";
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcriptPart = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalAccumulated += (finalAccumulated ? " " : "") + transcriptPart.trim();
                    } else {
                        interim += transcriptPart;
                    }
                }

                setInterimTranscript(interim);

                // Progressively append new spoken words to existing base text
                const base = baseTextOnStartRef.current;
                const spoken = finalAccumulated.trim();
                const totalText = base ? (spoken ? `${base} ${spoken}` : base) : spoken;

                if (spoken && totalText !== currentValueRef.current) {
                    onChange(totalText);
                }
            };

            recognition.onerror = (event: any) => {
                console.warn("Speech recognition error:", event.error);
                if (event.error === "not-allowed") {
                    toast.error("Microphone permission was denied. Please allow microphone access in your browser.");
                } else if (event.error !== "no-speech") {
                    toast.error(`Speech recognition: ${event.error}`);
                }
                setIsListening(false);
                setInterimTranscript("");
            };

            recognition.onend = () => {
                setIsListening(false);
                setInterimTranscript("");

                const base = baseTextOnStartRef.current;
                const spoken = finalAccumulated.trim();
                const fullText = base ? (spoken ? `${base} ${spoken}` : base) : spoken;

                if (spoken && fullText !== currentValueRef.current) {
                    onChange(fullText);
                }
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch (err) {
            console.error("Failed to start speech recognition:", err);
            setIsListening(false);
            toast.error("Could not start microphone.");
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch {
                // Ignore
            }
        }
        setIsListening(false);
        setInterimTranscript("");
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    return (
        <div className={cn("flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3", className)}>
            {/* Field Header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                {label ? (
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        {label}
                        {required && (
                            <span className="text-red-500 dark:text-red-400 font-bold text-sm select-none" aria-hidden="true">
                                *
                            </span>
                        )}
                    </label>
                ) : <div />}

                {/* Toolbar Controls */}
                <div className="flex items-center gap-2">
                    {/* Microphone Toggle Button */}
                    <button
                        type="button"
                        onClick={toggleListening}
                        disabled={disabled || !speechSupported}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all shadow-xs",
                            isListening
                                ? "bg-red-600 text-white animate-pulse hover:bg-red-700"
                                : "bg-accent hover:bg-accent/80 text-foreground border border-border",
                            (!speechSupported || disabled) && "opacity-50 cursor-not-allowed",
                        )}
                        title={
                            speechSupported
                                ? isListening
                                    ? "Click to stop recording"
                                    : "Click to start speech-to-text recording"
                                : "Speech recognition is not supported in this browser"
                        }
                    >
                        {isListening ? (
                            <>
                                <MicOff className="w-3.5 h-3.5" />
                                <span>Stop Recording</span>
                            </>
                        ) : (
                            <>
                                <Mic className="w-3.5 h-3.5 text-red-500" />
                                <span>Speak Note</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Live Listening Banner */}
            {isListening && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-700 dark:text-red-300 animate-fadeIn">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                    </span>
                    <span className="font-semibold">Listening:</span>
                    <span className="italic truncate flex-1">
                        {interimTranscript || "Speak now... audio will be transcribed in real-time."}
                    </span>
                </div>
            )}

            {/* Unsupported browser warning */}
            {!speechSupported && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Native speech recognition is not available in this browser. Please use Chrome, Edge, or Safari for voice input.</span>
                </div>
            )}

            {/* Textarea */}
            <div className="relative">
                <textarea
                    rows={4}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    disabled={disabled}
                    className={cn(
                        "flex w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-xs transition-colors resize-y",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400",
                        isListening && "ring-1 ring-red-500/50 border-red-500",
                    )}
                />
            </div>

            {/* Character count & error message */}
            <div className="flex items-center justify-between text-xs">
                {error ? (
                    <span className="text-red-500 dark:text-red-400">{error}</span>
                ) : (
                    <span></span>
                )}
                <span className="text-muted-foreground">
                    {value.length} / {maxLength}
                </span>
            </div>
        </div>
    );
};
