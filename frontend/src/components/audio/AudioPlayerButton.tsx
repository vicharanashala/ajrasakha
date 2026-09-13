import {useEffect, useRef, useState} from "react";
import {Pause, Play, Loader2, AlertCircle, Volume2} from "lucide-react";
import {Button} from "../atoms/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../atoms/tooltip";
import {useFetchTtsAudio} from "@/hooks/api/tts/useFetchTtsAudio";
import type {TtsRequestPayload} from "@/hooks/services/ttsService";
import {cn} from "@/lib/utils";
import {base64ToBlobUrl, revokeBlobUrl} from "./audioUtils";

type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";

export interface AudioPlayerButtonProps {
  /** The text to speak. */
  text: string;
  /** BCP-47 language code, e.g. "en-IN" or "hi-IN". */
  language: string;
  /** Optional voice id (Sarvam speaker). */
  speaker?: string;
  /** Optional override for pace multiplier (0.3 – 3.0). */
  pace?: number;
  /** Optional override for pitch (-1.0 – 1.0). */
  pitch?: number;
  /** Optional override for loudness (0.1 – 2.0). */
  loudness?: number;
  /** Optional override for the Sarvam model id. */
  model?: string;
  /** Disable the button (e.g. while the answer is still loading). */
  disabled?: boolean;
  /** Optional className passthrough for layout. */
  className?: string;
  /** Override the icon tooltip. */
  tooltip?: string;
  /** Render compact (icon-only) or with a label. */
  variant?: "icon" | "compact" | "full";
}

/**
 * Plays back server-generated TTS audio for the supplied text.
 *
 * State machine:
 *   idle → click → loading → playing
 *                        ↓
 *                     paused ← (click) ← playing
 *
 *   error → click → loading (retry)
 */
export const AudioPlayerButton = ({
  text,
  language,
  speaker,
  pace,
  pitch,
  loudness,
  model,
  disabled = false,
  className,
  tooltip = "Listen to this answer",
  variant = "compact",
}: AudioPlayerButtonProps) => {
  const [state, setState] = useState<PlayerState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const {mutate: fetchAudio, reset} = useFetchTtsAudio();

  // Stop and reset on unmount.
  useEffect(() => {
    return () => {
      revokeBlobUrl(blobUrlRef.current);
      blobUrlRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  // If the text/language/speaker changes after we've already loaded audio, reset.
  useEffect(() => {
    revokeBlobUrl(blobUrlRef.current);
    blobUrlRef.current = null;
    audioRef.current?.pause();
    setState("idle");
    setErrorMessage(null);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, language, speaker]);

  const handleClick = () => {
    if (disabled) return;

    if (state === "playing") {
      audioRef.current?.pause();
      setState("paused");
      return;
    }

    if (state === "paused") {
      void audioRef.current?.play().catch(err => {
        console.warn("[AudioPlayer] resume failed", err);
        setState("error");
        setErrorMessage("Audio playback was blocked.");
      });
      setState("playing");
      return;
    }

    if (state === "error") {
      setErrorMessage(null);
    }

    // idle OR error → fetch fresh audio.
    setState("loading");
    const payload: TtsRequestPayload = {
      text,
      language,
      ...(speaker !== undefined ? {speaker} : {}),
      ...(pace !== undefined ? {pace} : {}),
      ...(pitch !== undefined ? {pitch} : {}),
      ...(loudness !== undefined ? {loudness} : {}),
      ...(model !== undefined ? {model} : {}),
    };

    fetchAudio(payload, {
      onSuccess: response => {
        if (!response) {
          setState("error");
          setErrorMessage("Empty TTS response.");
          return;
        }
        try {
          revokeBlobUrl(blobUrlRef.current);
          const url = base64ToBlobUrl(response.audioBase64, response.contentType);
          blobUrlRef.current = url;
          if (!audioRef.current) {
            audioRef.current = new Audio();
          }
          const audio = audioRef.current;
          audio.src = url;
          audio.onended = () => setState("idle");
          audio.onerror = () => {
            setState("error");
            setErrorMessage("Failed to play audio.");
          };
          void audio.play().catch(err => {
            console.warn("[AudioPlayer] play() failed", err);
            setState("error");
            setErrorMessage("Audio playback was blocked by the browser.");
          });
          setState("playing");
        } catch (err: any) {
          console.error("[AudioPlayer] decode error", err);
          setState("error");
          setErrorMessage(err?.message ?? "Failed to decode audio.");
        }
      },
      onError: (err: any) => {
        setState("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to synthesize audio.",
        );
      },
    });
  };

  // — Render below is appended by the next edit —
  return renderPlayerUi({
    state,
    errorMessage,
    variant,
    tooltip,
    disabled,
    className,
    handleClick,
  });
};

/** Pure renderer — extracted so the component body stays small in source. */
function renderPlayerUi(params: {
  state: PlayerState;
  errorMessage: string | null;
  variant: "icon" | "compact" | "full";
  tooltip: string;
  disabled: boolean;
  className: string | undefined;
  handleClick: () => void;
}) {
  const {
    state,
    errorMessage,
    variant,
    tooltip,
    disabled,
    className,
    handleClick,
  } = params;

  const isLoading = state === "loading";
  const isPlaying = state === "playing";
  const isError = state === "error";

  const Icon = isLoading
    ? Loader2
    : isError
      ? AlertCircle
      : isPlaying
        ? Pause
        : Play;

  const label = isLoading
    ? "Generating…"
    : isError
      ? "Retry audio"
      : isPlaying
        ? "Pause"
        : state === "paused"
          ? "Resume"
          : "Listen";

  const button = (
    <Button
      type="button"
      variant={isError ? "outline" : isPlaying ? "secondary" : "ghost"}
      size={variant === "icon" ? "icon" : "sm"}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={cn(
        "transition-colors",
        isError && "border-destructive text-destructive hover:bg-destructive/10",
        isPlaying && "bg-primary/10 text-primary",
        className,
      )}
      aria-label={label}
      aria-pressed={isPlaying}
    >
      <Icon
        className={cn(
          variant === "icon" ? "h-4 w-4" : "h-3.5 w-3.5",
          isLoading && "animate-spin",
        )}
      />
      {variant === "full" && (
        <>
          <Volume2 className="ml-1.5 h-3.5 w-3.5 opacity-70" />
          <span className="ml-1.5">{label}</span>
        </>
      )}
      {variant === "compact" && (
        <span className="ml-1.5 text-xs">{label}</span>
      )}
    </Button>
  );

  if (variant === "icon") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isError && errorMessage ? errorMessage : tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}