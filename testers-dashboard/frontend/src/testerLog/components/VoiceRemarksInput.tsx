import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, AlertCircle, CheckCircle2, Loader2, Undo2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TesterLogService } from "../services/testerLogService";
import type { IGrammarCorrection } from "../types";

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

    // Grammar validation state
    const [isValidatingGrammar, setIsValidatingGrammar] = useState(false);
    const [autoCheckGrammar, setAutoCheckGrammar] = useState(true);
    const [suggestions, setSuggestions] = useState<IGrammarCorrection[]>([]);
    const [isGrammarValid, setIsGrammarValid] = useState<boolean | null>(null);
    const [previousText, setPreviousText] = useState<string | null>(null);

    const recognitionRef = useRef<any>(null);
    const currentValueRef = useRef(value);
    const baseTextOnStartRef = useRef("");
    const autoCheckGrammarRef = useRef(autoCheckGrammar);

    useEffect(() => {
        currentValueRef.current = value;
    }, [value]);

    useEffect(() => {
        autoCheckGrammarRef.current = autoCheckGrammar;
    }, [autoCheckGrammar]);

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

    const triggerGrammarValidation = async (textToValidate?: string) => {
        const text = (textToValidate !== undefined ? textToValidate : currentValueRef.current || "").trim();
        if (!text || text.length < 2) {
            toast.error("Please enter or dictate remarks before checking grammar.");
            return;
        }

        setIsValidatingGrammar(true);
        try {
            const res = await testerLogService.validateGrammar(text);

            if (res.isUnavailable) {
                if (textToValidate === undefined) {
                    toast.info("Grammar validator service is currently unreachable.");
                }
                return;
            }

            if (res.isValid && (!res.suggestions || res.suggestions.length === 0)) {
                setIsGrammarValid(true);
                setSuggestions([]);
                toast.success("Grammar is valid!");
            } else {
                setIsGrammarValid(false);
                const fetchedSuggestions = res.suggestions || [];
                setSuggestions(fetchedSuggestions);
                if (fetchedSuggestions.length > 0) {
                    toast.info(`Found ${fetchedSuggestions.length} grammar suggestion${fetchedSuggestions.length > 1 ? "s" : ""}`);
                }
            }
        } catch (err: any) {
            console.warn("Grammar validation error:", err);
            toast.error(err?.message || "Failed to validate grammar.");
        } finally {
            setIsValidatingGrammar(false);
        }
    };

    const applySuggestion = (suggestion: IGrammarCorrection) => {
        const current = currentValueRef.current;
        setPreviousText(current);
        let next = current;
        if (current === suggestion.original) {
            next = suggestion.corrected;
        } else if (suggestion.original && current.includes(suggestion.original)) {
            next = current.replace(suggestion.original, suggestion.corrected);
        } else if (suggestion.corrected) {
            next = suggestion.corrected;
        }
        onChange(next);
        setSuggestions((prev) => prev.filter((s) => s !== suggestion));
        setIsGrammarValid(true);
        toast.success("Grammar correction applied!");
    };

    const applyAllSuggestions = () => {
        const current = currentValueRef.current;
        setPreviousText(current);
        let next = current;
        for (const s of suggestions) {
            if (next === s.original) {
                next = s.corrected;
            } else if (s.original && next.includes(s.original)) {
                next = next.replace(s.original, s.corrected);
            } else if (s.corrected && suggestions.length === 1) {
                next = s.corrected;
            }
        }
        onChange(next);
        setSuggestions([]);
        setIsGrammarValid(true);
        toast.success("All grammar corrections applied!");
    };

    const dismissSuggestions = () => {
        setSuggestions([]);
        setIsGrammarValid(null);
    };

    const handleUndo = () => {
        if (previousText !== null) {
            onChange(previousText);
            setPreviousText(null);
            setSuggestions([]);
            setIsGrammarValid(null);
            toast.info("Reverted grammar fix.");
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

                // If auto-check grammar is enabled and speech was transcribed, trigger validation
                if (autoCheckGrammarRef.current && spoken && fullText.trim().length >= 3) {
                    triggerGrammarValidation(fullText);
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
                <div className="flex flex-wrap items-center gap-2">
                    {/* Auto-check toggle */}
                    <label
                        className="flex items-center gap-1.5 text-xs text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors"
                        title="Automatically check grammar when you finish speaking"
                    >
                        <input
                            type="checkbox"
                            checked={autoCheckGrammar}
                            onChange={(e) => setAutoCheckGrammar(e.target.checked)}
                            disabled={disabled || isValidatingGrammar}
                            className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                        />
                        <span>Auto-check</span>
                    </label>

                    {/* Check Grammar Button */}
                    <button
                        type="button"
                        onClick={() => triggerGrammarValidation()}
                        disabled={disabled || isValidatingGrammar || isListening || !value.trim()}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all shadow-xs",
                            "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:border-primary/40 active:scale-95",
                            "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
                        )}
                        title="Validate remarks grammar"
                    >
                        {isValidatingGrammar ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Checking...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                <span>Check Grammar</span>
                            </>
                        )}
                    </button>

                    {/* Undo Fix Button */}
                    {previousText !== null && (
                        <button
                            type="button"
                            onClick={handleUndo}
                            disabled={disabled || isValidatingGrammar}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Revert to original text prior to grammar fix"
                        >
                            <Undo2 className="w-3 h-3" />
                            <span>Undo Fix</span>
                        </button>
                    )}

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
                    onChange={(e) => {
                        onChange(e.target.value);
                        if (suggestions.length > 0) setSuggestions([]);
                        if (isGrammarValid !== null) setIsGrammarValid(null);
                    }}
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

            {/* Grammar Suggestions Card */}
            {suggestions.length > 0 && (
                <div className="flex flex-col gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-foreground animate-fadeIn">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Grammar Suggestions ({suggestions.length})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {suggestions.length > 1 && (
                                <button
                                    type="button"
                                    onClick={applyAllSuggestions}
                                    className="px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700 font-medium transition-colors"
                                >
                                    Apply All
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={dismissSuggestions}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-amber-500/20 transition-colors"
                                title="Dismiss suggestions"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        {suggestions.map((s, idx) => (
                            <div key={idx} className="flex flex-wrap items-start justify-between gap-2 p-2 rounded bg-background/80 border border-border/60">
                                <div className="flex-1 space-y-0.5 min-w-[200px]">
                                    {s.explanation && (
                                        <p className="text-muted-foreground text-[11px] italic">{s.explanation}</p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[12px]">
                                        {s.original && s.original !== s.corrected && (
                                            <span className="line-through text-red-500/80 dark:text-red-400/80 mr-1">{s.original}</span>
                                        )}
                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{s.corrected}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => applySuggestion(s)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-colors shrink-0"
                                >
                                    <Check className="w-3 h-3" />
                                    <span>Apply</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Grammar Valid Indicator */}
            {isGrammarValid === true && suggestions.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 animate-fadeIn">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Grammar validated.</span>
                </div>
            )}

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
