import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "./atoms/button";
import { Label } from "./atoms/label";
import { Badge } from "./atoms/badge";
import { useDetectChemicals } from "../hooks/api/answer/useDetectChemicals";
import type { ChemicalMatch, ChemicalDetectionResponse } from "../hooks/services/answerService";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ChemicalVerifiedTextareaProps {
  id?: string;
  label?: React.ReactNode;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  textareaClassName?: string;
  minHeight?: string;
  maxHeight?: string;
  disabled?: boolean;
  required?: boolean;
  actions?: React.ReactNode;
  onVerificationComplete?: (response: ChemicalDetectionResponse | null) => void;
  showBadges?: boolean;
  helperText?: string;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const ChemicalVerifiedTextarea: React.FC<ChemicalVerifiedTextareaProps> = ({
  id = "chemical-verified-textarea",
  label,
  placeholder = "Enter your answer here...",
  value,
  onChange,
  className,
  textareaClassName,
  minHeight = "min-h-[210px]",
  maxHeight = "max-h-[240px]",
  disabled = false,
  required = false,
  actions,
  onVerificationComplete,
  showBadges = true,
  helperText,
}) => {
  const [matches, setMatches] = useState<ChemicalMatch[]>([]);
  const [hasVerified, setHasVerified] = useState<boolean>(false);
  const [lastVerifiedText, setLastVerifiedText] = useState<string>("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const { mutateAsync: detectChemicals, isPending: isVerifying } = useDetectChemicals();

  // Strict verification condition: Only verified if the current text EXACTLY matches what was verified
  const isCurrentTextVerified = useMemo(() => {
    return (
      hasVerified &&
      value.trim().length > 0 &&
      value.trim() === lastVerifiedText.trim()
    );
  }, [hasVerified, value, lastVerifiedText]);

  // Synchronize scroll between textarea and the backdrop highlighting layer
  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Whenever text changes away from the verified text, immediately reset verification state
  useEffect(() => {
    if (hasVerified && value !== lastVerifiedText) {
      setHasVerified(false);
      setMatches([]);
    }
  }, [value, hasVerified, lastVerifiedText]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    if (hasVerified && newVal !== lastVerifiedText) {
      setHasVerified(false);
      setMatches([]);
    }
    onChange(newVal);
  };

  const handleVerify = async () => {
    if (!value.trim()) {
      toast.info("Please enter some text before verifying.");
      return;
    }

    // Reset verified state before checking
    setHasVerified(false);
    setMatches([]);

    try {
      const response = await detectChemicals(value);

      // Check if response is valid and non-null
      if (!response || !Array.isArray(response.matches)) {
        setHasVerified(false);
        setMatches([]);
        setLastVerifiedText("");
        toast.error("Chemical verification service is currently unavailable. Please try again.");
        return;
      }

      const foundMatches = response.matches;
      setMatches(foundMatches);
      setHasVerified(true);
      setLastVerifiedText(value);
      onVerificationComplete?.(response);

      const banned = foundMatches.filter((m) => m.status?.toLowerCase() === "banned");
      const restricted = foundMatches.filter((m) => m.status?.toLowerCase() === "restricted");

      if (banned.length > 0) {
        toast.error(`Banned chemical detected: ${banned.map((m) => m.name).join(", ")}`);
      } else if (restricted.length > 0) {
        toast.warning(`Restricted chemical detected: ${restricted.map((m) => m.name).join(", ")}`);
      } else {
        toast.success("Chemical check passed: No banned or restricted chemicals found.");
      }
    } catch (error: any) {
      console.error("[ChemicalVerifiedTextarea] Verification failed (full error details):", error);
      setHasVerified(false);
      setMatches([]);
      setLastVerifiedText("");

      const rawMsg = error?.message || "";
      const isTechnical =
        !rawMsg ||
        rawMsg.includes("ECONNREFUSED") ||
        rawMsg.includes("Failed to fetch") ||
        rawMsg.includes("NetworkError") ||
        rawMsg.includes("500") ||
        rawMsg.includes("status code") ||
        rawMsg.includes("Internal Server Error") ||
        rawMsg.includes("TypeError") ||
        rawMsg.includes("SyntaxError");

      const friendlyMessage = isTechnical
        ? "Chemical verification service is temporarily unavailable. Please try again later."
        : rawMsg;

      toast.error(friendlyMessage);
    }
  };

  const bannedMatches = useMemo(
    () => (isCurrentTextVerified ? matches.filter((m) => m.status?.toLowerCase() === "banned") : []),
    [isCurrentTextVerified, matches]
  );
  const restrictedMatches = useMemo(
    () => (isCurrentTextVerified ? matches.filter((m) => m.status?.toLowerCase() === "restricted") : []),
    [isCurrentTextVerified, matches]
  );

  // Render backdrop text with highlighted marks only when verified
  const renderHighlightedBackdrop = useCallback(() => {
    if (!value || !isCurrentTextVerified || matches.length === 0) {
      return <span>{value}</span>;
    }

    // 1. Sanitize, deduplicate, and sort matched chemical names longest-first
    const validMatches = Array.from(
      new Map(
        matches
          .filter((m) => m && typeof m.name === "string" && m.name.trim().length > 0)
          .map((m) => [m.name.trim().toLowerCase(), { ...m, name: m.name.trim() }])
      ).values()
    ).sort((a, b) => b.name.length - a.name.length);

    if (validMatches.length === 0) {
      return <span>{value}</span>;
    }

    // 2. Build precise boundary regex patterns
    const patterns = validMatches.map((m) => {
      const escaped = escapeRegExp(m.name);
      const startsWithWord = /^\w/.test(m.name);
      const endsWithWord = /\w$/.test(m.name);
      const prefix = startsWithWord ? "(?<=^|[^\\w])" : "";
      const suffix = endsWithWord ? "(?=[^\\w]|$)" : "";
      return `${prefix}${escaped}${suffix}`;
    });

    const regex = new RegExp(`(${patterns.join("|")})`, "gi");
    const parts = value.split(regex);

    return parts.map((part, index) => {
      if (!part) return null;

      // Find exact chemical match case-insensitively
      const matchedChemical = validMatches.find(
        (m) => m.name.toLowerCase() === part.toLowerCase()
      );

      if (matchedChemical) {
        const isBanned = matchedChemical.status?.toLowerCase() === "banned";
        return (
          <mark
            key={index}
            className={cn(
              "rounded-sm select-none pointer-events-none transition-colors",
              // Zero horizontal padding/margin and normal font-weight to prevent backdrop text drift
              "p-0 m-0 font-normal",
              isBanned
                ? "bg-red-500/30 dark:bg-red-500/40 text-transparent border-b-2 border-red-500"
                : "bg-amber-500/30 dark:bg-amber-500/40 text-transparent border-b-2 border-amber-500"
            )}
            style={{
              fontFamily: "inherit",
              fontSize: "inherit",
              lineHeight: "inherit",
              letterSpacing: "inherit",
              fontWeight: "inherit",
            }}
          >
            {part}
          </mark>
        );
      }
      return <span key={index}>{part}</span>;
    });
  }, [value, isCurrentTextVerified, matches]);

  return (
    <div className={cn("w-full flex flex-col space-y-2", className)}>
      {/* Header with Label, Actions and Verify Button */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {label && (
            <Label htmlFor={id} className="text-sm font-medium text-foreground">
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </Label>
          )}
        </div>

        <div className="flex items-center gap-2">
          {actions}

          <Button
            type="button"
            size="sm"
            variant={
              !isCurrentTextVerified
                ? "outline"
                : bannedMatches.length > 0
                ? "destructive"
                : restrictedMatches.length > 0
                ? "outline"
                : "secondary"
            }
            onClick={handleVerify}
            disabled={disabled || isVerifying || !value.trim()}
            className={cn(
              "h-8 px-2.5 text-xs font-medium gap-1.5 transition-all duration-200 shadow-none",
              isCurrentTextVerified &&
                matches.length === 0 &&
                "text-green-600 dark:text-green-400 border-green-500/40 bg-green-50/50 dark:bg-green-950/30",
              isCurrentTextVerified &&
                restrictedMatches.length > 0 &&
                bannedMatches.length === 0 &&
                "text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/30"
            )}
            title="Verify that answer does not contain banned or restricted chemicals"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Checking Chemicals...</span>
              </>
            ) : !isCurrentTextVerified ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Verify Chemicals</span>
              </>
            ) : bannedMatches.length > 0 ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Banned Found ({bannedMatches.length})</span>
              </>
            ) : restrictedMatches.length > 0 ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Restricted Found ({restrictedMatches.length})</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                <span>Chemicals Verified</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Textarea Container with Highlighting Backdrop */}
      <div className="relative w-full rounded-md overflow-hidden">
        {/* Backdrop for highlighted text */}
        <div
          ref={backdropRef}
          aria-hidden="true"
          className={cn(
            "absolute inset-0 pointer-events-none p-3 text-sm md:text-md overflow-y-auto whitespace-pre-wrap break-words text-transparent select-none font-sans leading-relaxed border border-transparent",
            minHeight,
            maxHeight
          )}
          style={{
            fontFamily: "inherit",
            fontSize: "inherit",
            lineHeight: "1.625",
            letterSpacing: "normal",
            boxSizing: "border-box",
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
        >
          {renderHighlightedBackdrop()}
        </div>

        {/* Real Editable Textarea on Top */}
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={handleTextChange}
          onScroll={handleScroll}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "relative z-10 w-full resize-y border text-sm md:text-md rounded-md overflow-y-auto p-3 bg-transparent text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring font-sans leading-relaxed transition-colors",
            isCurrentTextVerified && bannedMatches.length > 0
              ? "border-red-500/70 focus-visible:ring-red-400 dark:border-red-500/80"
              : isCurrentTextVerified && restrictedMatches.length > 0
              ? "border-amber-500/70 focus-visible:ring-amber-400 dark:border-amber-500/80"
              : "border-gray-200 dark:border-gray-600",
            minHeight,
            maxHeight,
            textareaClassName
          )}
          style={{
            fontFamily: "inherit",
            fontSize: "inherit",
            lineHeight: "1.625",
            letterSpacing: "normal",
            boxSizing: "border-box",
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
        />
      </div>

      {/* Badges / Alerts Section (Only rendered when the CURRENT text is verified) */}
      {showBadges && isCurrentTextVerified && (
        <div className="flex flex-col gap-2 pt-1">
          {/* Banned Alert */}
          {bannedMatches.length > 0 && (
            <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 text-xs animate-in fade-in duration-200">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <div className="flex-1">
                <span className="font-semibold">Banned chemicals detected:</span>{" "}
                {bannedMatches.map((m) => (
                  <Badge
                    key={m.name}
                    variant="destructive"
                    className="mx-1 px-1.5 py-0 text-[11px] font-medium"
                  >
                    {m.name}
                  </Badge>
                ))}
                <p className="mt-1 text-red-600/90 dark:text-red-300/90">
                  Answers containing banned chemicals cannot be submitted. Please remove or replace them.
                </p>
              </div>
            </div>
          )}

          {/* Restricted Alert */}
          {restrictedMatches.length > 0 && (
            <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs animate-in fade-in duration-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <span className="font-semibold">Restricted chemicals detected:</span>{" "}
                {restrictedMatches.map((m) => (
                  <Badge
                    key={m.name}
                    className="mx-1 px-1.5 py-0 text-[11px] font-medium bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/40"
                  >
                    {m.name}
                  </Badge>
                ))}
                <p className="mt-1 text-amber-700/90 dark:text-amber-300/90">
                  Ensure label precautions, safety guidelines, and restricted usage conditions are clearly noted.
                </p>
              </div>
            </div>
          )}

          {/* Clean / Safe Alert */}
          {matches.length === 0 && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300 text-xs animate-in fade-in duration-200">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
              <span>No banned or restricted chemicals found in this answer.</span>
            </div>
          )}
        </div>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};
