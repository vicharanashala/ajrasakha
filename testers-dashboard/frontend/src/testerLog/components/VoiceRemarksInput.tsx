import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Sparkles, Undo2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TesterLogService } from "../services/testerLogService";

const testerLogService = new TesterLogService();

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

const SUPPORTED_SPEECH_LANGUAGES = [
    { code: "en-IN", label: "English (India)" },
    { code: "hi-IN", label: "Hindi (हिन्दी)" },
    { code: "en-US", label: "English (US)" },
    { code: "te-IN", label: "Telugu (తెలుగు)" },
    { code: "ta-IN", label: "Tamil (தமிழ்)" },
    { code: "mr-IN", label: "Marathi (मराठी)" },
    { code: "bn-IN", label: "Bengali (বাংলা)" },
];

export const VoiceRemarksInput: React.FC<VoiceRemarksInputProps> = ({
    label = "Remarks Details",
    value = "",
    onChange,
    placeholder = "Speak using microphone or type your detailed remarks...",
    maxLength = 2000,
    required = false,
    error,
    category,
    disabled = false,
    className,
}) => {
    const [isListening, setIsListening] = useState(false);
    const [isFormatting, setIsFormatting] = useState(false);
    const [speechLanguage, setSpeechLanguage] = useState("en-IN");
    const [autoOrganize, setAutoOrganize] = useState(true);
    const [speechSupported, setSpeechSupported] = useState(true);
    const [interimTranscript, setInterimTranscript] = useState("");
    const [originalTranscript, setOriginalTranscript] = useState<string | null>(null);

    const recognitionRef = useRef<any>(null);
    const currentValueRef = useRef(value);
    const autoOrganizeRef = useRef(autoOrganize);
    const isListeningRef = useRef(isListening);

    useEffect(() => {
        currentValueRef.current = value;
    }, [value]);

    useEffect(() => {
        autoOrganizeRef.current = autoOrganize;
    }, [autoOrganize]);

    useEffect(() => {
        isListeningRef.current = isListening;
    }, [isListening]);

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

    const triggerAiFormatting = async (rawText: string) => {
        const textToFormat = rawText.trim();
        if (!textToFormat) {
            toast.error("Please enter or speak remarks before organizing.");
            return;
        }

        setIsFormatting(true);
        try {
            setOriginalTranscript(rawText);
            const result = await testerLogService.formatRemarks(
                textToFormat,
                category,
                speechLanguage,
            );

            if (result?.formattedText && result.formattedText.trim() !== textToFormat) {
                onChange(result.formattedText.trim());
                toast.success("Remarks organized and polished with AI!");
            } else {
                toast.info("Remarks are already well-structured.");
            }
        } catch (err: any) {
            console.error("AI Formatting error:", err);
            toast.error(err?.message || "Failed to organize remarks with AI.");
        } finally {
            setIsFormatting(false);
        }
    };

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

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = speechLanguage;

            let finalAccumulated = "";

            recognition.onstart = () => {
                setIsListening(true);
                setInterimTranscript("");
                toast.info("Microphone active. Speak your remarks clearly...");
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

                // Update text field progressively with spoken text
                const baseText = currentValueRef.current.trim();
                const totalText = finalAccumulated
                    ? (baseText ? `${baseText} ${finalAccumulated}` : finalAccumulated)
                    : baseText;

                if (totalText !== currentValueRef.current && finalAccumulated) {
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

                // If auto-organize is enabled and we captured text, trigger AI formatting
                const latestText = currentValueRef.current.trim();
                if (autoOrganizeRef.current && latestText && latestText.length >= 5) {
                    triggerAiFormatting(latestText);
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

    const handleUndo = () => {
        if (originalTranscript !== null) {
            onChange(originalTranscript);
            setOriginalTranscript(null);
            toast.info("Restored original remarks.");
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
                <div className="flex flex-wrap items-center gap-2">
                    {/* Language selector */}
                    <select
                        aria-label="Speech language"
                        value={speechLanguage}
                        onChange={(e) => setSpeechLanguage(e.target.value)}
                        disabled={isListening || isFormatting || disabled}
                        className="text-xs h-7 px-2 py-0.5 rounded border border-border bg-background text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        {SUPPORTED_SPEECH_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                                {lang.label}
                            </option>
                        ))}
                    </select>

                    {/* Auto-organize Toggle */}
                    <label
                        className="flex items-center gap-1.5 text-xs text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors"
                        title="Automatically organize and fix grammar with AI when you finish speaking"
                    >
                        <input
                            type="checkbox"
                            checked={autoOrganize}
                            onChange={(e) => setAutoOrganize(e.target.checked)}
                            disabled={disabled || isFormatting}
                            className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                        />
                        <span>Auto-organize</span>
                    </label>

                    {/* Organize with AI Button */}
                    <button
                        type="button"
                        onClick={() => triggerAiFormatting(value)}
                        disabled={disabled || isFormatting || isListening || !value.trim()}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all shadow-xs",
                            "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:border-primary/40 active:scale-95",
                            "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
                        )}
                        title="Organize into structured QA defect remarks and fix grammar using AI"
                    >
                        {isFormatting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Organizing...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                                <span>Organize with AI</span>
                            </>
                        )}
                    </button>

                    {/* Undo AI Action */}
                    {originalTranscript !== null && (
                        <button
                            type="button"
                            onClick={handleUndo}
                            disabled={disabled || isFormatting}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Revert to original text prior to AI organizing"
                        >
                            <Undo2 className="w-3 h-3" />
                            <span>Undo AI</span>
                        </button>
                    )}

                    {/* Microphone Toggle Button */}
                    <button
                        type="button"
                        onClick={toggleListening}
                        disabled={disabled || isFormatting || !speechSupported}
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
                    disabled={disabled || isFormatting}
                    className={cn(
                        "flex w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm shadow-xs transition-colors resize-y",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        error && "border-red-500 dark:border-red-400 focus-visible:ring-red-500 dark:focus-visible:ring-red-400",
                        isListening && "ring-1 ring-red-500/50 border-red-500",
                    )}
                />

                {isFormatting && (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] flex items-center justify-center rounded-md">
                        <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-full shadow-md border border-border text-xs text-foreground font-medium">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                            <span>AI is organizing & fixing grammar...</span>
                        </div>
                    </div>
                )}
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
