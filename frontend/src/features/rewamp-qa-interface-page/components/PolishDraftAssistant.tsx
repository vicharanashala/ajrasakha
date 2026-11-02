import React, { useState, useMemo } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Info,
  ShieldCheck,
  BookOpen,
  Loader2,
  X,
  Split,
  AlignLeft,
  Copy,
  Layers,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { toast } from "sonner";
import { diffWords } from "@/utils/wordDifference";
import {
  usePolishDraft,
} from "@/hooks/api/answer/usePolishDraft";
import type {
  StructuralValidationStep,
} from "@/hooks/services/writingAssistantService";

export interface PolishDraftAssistantProps {
  questionText: string;
  draftAnswer: string;
  onApplySuggestedText: (suggestedText: string) => void;
  isEnlarged?: boolean;
}

export const PolishDraftAssistant: React.FC<PolishDraftAssistantProps> = ({
  questionText,
  draftAnswer,
  onApplySuggestedText,
  isEnlarged = false,
}) => {
  const { polishDraft, isPolishing, result, error, reset, activeJobId } = usePolishDraft();

  // Diff view toggle for suggested text: "text" | "diff"
  const [viewMode, setViewMode] = useState<"text" | "diff">("text");

  // Dismissible order warnings state (keyed by dismissal status)
  const [isOrderWarningDismissed, setIsOrderWarningDismissed] = useState(false);

  // Snapshot of the draft when Polish was initiated, to accurately compare diffs
  const [analyzedDraftSnapshot, setAnalyzedDraftSnapshot] = useState<string>("");

  const handleTriggerPolish = () => {
    const cleanQuestion = questionText?.trim() || "";
    const cleanDraft = draftAnswer?.trim() || "";

    if (!cleanQuestion && !cleanDraft) {
      toast.info("Please provide a question and a draft answer before polishing.");
      return;
    }
    if (!cleanQuestion) {
      toast.info("Question text is missing. Please select a valid question before polishing.");
      return;
    }
    if (!cleanDraft) {
      toast.info("Please enter or generate a draft answer before polishing.");
      return;
    }

    setAnalyzedDraftSnapshot(cleanDraft);
    setIsOrderWarningDismissed(false);
    polishDraft({
      question: cleanQuestion,
      draft: cleanDraft,
    });
  };

  const handleAcceptSuggestion = (suggestedText: string) => {
    onApplySuggestedText(suggestedText);
    toast.success("Accepted suggestion and updated draft editor.");
  };

  const handleRejectSuggestion = () => {
    reset();
    toast.info("Suggestion rejected; original draft preserved.");
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  // Compute word difference between the analyzed draft and suggested text
  const diffParts = useMemo(() => {
    if (!result?.languagePolishing?.suggestedText) return [];
    return diffWords(
      analyzedDraftSnapshot || draftAnswer,
      result.languagePolishing.suggestedText
    );
  }, [analyzedDraftSnapshot, draftAnswer, result?.languagePolishing?.suggestedText]);

  const lp = result?.languagePolishing;
  const sv = result?.structuralValidation;

  return (
    <div className="flex-1 flex flex-col space-y-3.5 min-w-0">
      {/* Top Action Header */}
      <div className="rounded-xl border border-border/80 bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-emerald-500/5 p-3 sm:p-3.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-xs font-semibold text-foreground">
                Writing Assistant & Reference Checks
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal max-w-xl">
              Polishes language clarity, grammar, and style while independently validating coverage
              against Golden Database reference structure guidelines.
            </p>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
            {result && !isPolishing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  reset();
                }}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                title="Clear current analysis"
              >
                Clear
              </Button>
            )}

            <Button
              size="sm"
              onClick={handleTriggerPolish}
              disabled={isPolishing}
              className="h-8 px-3.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white shadow-xs flex items-center gap-1.5 transition-all"
            >
              {isPolishing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Polishing Draft...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Polish Draft</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Input context info pill */}
        <div className="mt-2.5 pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate max-w-md">
            <span className="font-medium text-foreground">Question: </span>
            {questionText ? questionText.slice(0, 80) + (questionText.length > 80 ? "..." : "") : "None"}
          </span>
          <span className="shrink-0">
            Draft: {draftAnswer.trim() ? draftAnswer.trim().split(/\s+/).length : 0} words
          </span>
        </div>
      </div>

      {/* Loading State */}
      {isPolishing && (
        <Card className="border border-purple-500/30 bg-purple-500/5 shadow-xs animate-pulse">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2.5">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-foreground">
                Analyzing draft with Writing Assistant...
              </p>
              <p className="text-[11px] text-muted-foreground max-w-md">
                Running sequential language safety checks and structural reference validation.
                Because this performs multi-step evaluations, it may take 15–90 seconds.
              </p>
              {activeJobId && (
                <p className="text-[10px] text-purple-600 dark:text-purple-400 font-mono pt-1">
                  Tracking Job ID: {activeJobId}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global Request Error State (e.g. Network/Render Cold Start failure) */}
      {error && !isPolishing && !result && (
        <Card className="border border-destructive/30 bg-destructive/5 shadow-xs">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-destructive">
                  Draft analysis could not be completed
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {error.message || "Writing Assistant service is temporarily unreachable."} Your original
                  draft has not been modified and you can still submit normally.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTriggerPolish}
              className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State before first trigger */}
      {!result && !isPolishing && !error && (
        <div className="flex-1 min-h-[220px] rounded-xl border border-dashed border-border/80 bg-muted/10 p-6 flex flex-col items-center justify-center text-center space-y-2.5">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              Draft Assistant Ready
            </p>
            <p className="text-xs text-muted-foreground max-w-md">
              Click the <span className="font-semibold text-foreground">Polish Draft</span> button above to run
              two independent checks: language polishing suggestions and structural reference validation.
            </p>
          </div>
        </div>
      )}

      {/* RESULTS DISPLAY: Two strictly independent panels/signals */}
      {result && !isPolishing && (
        <div className={`grid gap-3.5 ${isEnlarged ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* ============================================================ */}
          {/* PANEL 1: LANGUAGE POLISHING                                 */}
          {/* ============================================================ */}
          <Card className="border border-border/80 shadow-xs flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-3 border-b border-border/70 bg-muted/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AlignLeft className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-foreground">Language Polishing</span>
              </div>

              {/* Status Badge */}
              {lp?.status === "suggested" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 font-medium"
                >
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Suggested Rewrite
                </Badge>
              )}
              {lp?.status === "rejected" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1 font-medium"
                >
                  <ShieldAlert className="w-2.5 h-2.5" />
                  Rewrite Withheld
                </Badge>
              )}
              {lp?.status === "unavailable" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30 gap-1 font-medium"
                >
                  <XCircle className="w-2.5 h-2.5" />
                  Unavailable
                </Badge>
              )}
            </div>

            <CardContent className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
              {/* STATE 1: SUGGESTED */}
              {lp?.status === "suggested" && lp.suggestedText && (
                <div className="space-y-3">
                  {/* View Mode Bar */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      The safety checks identified grammar, clarity, and phrasing improvements.
                    </p>
                    <div className="inline-flex rounded-md border border-border/70 p-0.5 bg-muted/30">
                      <button
                        type="button"
                        onClick={() => setViewMode("text")}
                        className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors cursor-pointer ${
                          viewMode === "text"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Clean Text
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("diff")}
                        className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                          viewMode === "diff"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Split className="w-2.5 h-2.5" />
                        Diff View
                      </button>
                    </div>
                  </div>

                  {/* Text or Diff Preview */}
                  {viewMode === "text" ? (
                    <div className="p-3 rounded-lg bg-background border border-border/70 text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto">
                      {lp.suggestedText}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-background border border-border/70 text-xs leading-relaxed max-h-[220px] overflow-y-auto">
                      <div className="text-[11px] font-semibold text-muted-foreground mb-1 flex items-center gap-2">
                        <span>Comparison:</span>
                        <span className="text-[10px] font-normal text-red-600 dark:text-red-400">
                          Red = Original Removed
                        </span>
                        <span>•</span>
                        <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                          Green = Rewritten Added
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap">
                        {diffParts.map((part, idx) => {
                          if (part.type === "added") {
                            return (
                              <span
                                key={idx}
                                className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 px-0.5 rounded font-medium"
                              >
                                {part.value}
                              </span>
                            );
                          }
                          if (part.type === "removed") {
                            return (
                              <span
                                key={idx}
                                className="bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 line-through px-0.5 rounded opacity-75"
                              >
                                {part.value}
                              </span>
                            );
                          }
                          return <span key={idx}>{part.value}</span>;
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions: Accept & Reject */}
                  <div className="flex items-center justify-between pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyText(lp.suggestedText || "")}
                      className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRejectSuggestion}
                        className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Reject Suggestion
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAcceptSuggestion(lp.suggestedText || "")}
                        className="h-7 px-3 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                      >
                        <ArrowRight className="w-3 h-3 mr-1" />
                        Accept Suggestion
                      </Button>
                    </div>
                  </div>

                  {/* Guardrail Disclaimer */}
                  <div className="rounded-md bg-muted/40 border border-border/60 p-2 flex items-start gap-1.5 text-[10px] text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      {lp.guardrail?.disclaimer ||
                        "These checks reduce the risk of an unintended technical change; they do not prove complete semantic equivalence."}
                    </span>
                  </div>
                </div>
              )}

              {/* STATE 2: REJECTED */}
              {lp?.status === "rejected" && (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-foreground">
                          Language rewrite was withheld
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          The automated rewrite was withheld because safety checks detected a potential
                          change in technical meaning, active chemical names, dosage, or condition constraints.
                        </p>
                        {lp.reason && (
                          <div className="pt-1 text-[11px] font-medium text-foreground">
                            <span className="text-muted-foreground">Reason: </span>
                            {lp.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">
                    Your original draft remains active and unchanged in the editor.
                  </p>
                </div>
              )}

              {/* STATE 3: UNAVAILABLE */}
              {lp?.status === "unavailable" && (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg border border-border/70 bg-muted/20 space-y-2">
                    <p className="text-xs font-medium text-foreground">
                      Language polishing couldn’t be completed right now.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      The service timed out or could not produce a high-confidence rewrite. This is not an
                      indication that your draft has issues.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleTriggerPolish}
                      className="h-7 text-xs mt-1"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Retry Polishing
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ============================================================ */}
          {/* PANEL 2: STRUCTURAL VALIDATION                               */}
          {/* ============================================================ */}
          <Card className="border border-border/80 shadow-xs flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-3 border-b border-border/70 bg-muted/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-semibold text-foreground">Structural Validation</span>
              </div>

              {/* Status Badge */}
              {sv?.status === "complete" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 font-medium"
                >
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  All Steps Covered
                </Badge>
              )}
              {sv?.status === "partial" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1 font-medium"
                >
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Partially Covered
                </Badge>
              )}
              {sv?.status === "incomplete" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30 gap-1 font-medium"
                >
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Missing Steps
                </Badge>
              )}
              {sv?.status === "needs_clarification" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30 gap-1 font-medium"
                >
                  <Info className="w-2.5 h-2.5" />
                  Needs Clarification
                </Badge>
              )}
              {sv?.status === "reference_data_unavailable" && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30 gap-1 font-medium"
                >
                  <XCircle className="w-2.5 h-2.5" />
                  Ref Unavailable
                </Badge>
              )}
            </div>

            <CardContent className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
              {/* Matched Reference Banner if present */}
              {sv?.matchedReference && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pb-1">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  <span>
                    Matched Reference:{" "}
                    <strong className="text-foreground">
                      {sv.matchedReference.domain || "Standard Reference"}
                    </strong>
                    {sv.matchedReference.code ? ` (${sv.matchedReference.code})` : ""}
                  </span>
                </div>
              )}

              {/* Order Warnings notice (Secondary, Dismissible) */}
              {!isOrderWarningDismissed &&
                sv?.orderWarnings &&
                sv.orderWarnings.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-start justify-between gap-2 text-xs">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="font-semibold text-amber-900 dark:text-amber-200 text-[11px]">
                          Sequence Notice:
                        </span>
                        <ul className="list-disc list-inside text-[11px] text-amber-800 dark:text-amber-300">
                          {sv.orderWarnings.map((warn, wIdx) => (
                            <li key={wIdx}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsOrderWarningDismissed(true)}
                      className="h-5 w-5 rounded text-amber-700 hover:text-amber-900 hover:bg-amber-500/20"
                      title="Dismiss notice"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}

              {/* STATUS: COMPLETE */}
              {sv?.status === "complete" && (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      All expected reference steps appear to be covered.
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Your draft includes the key structural components expected by the matched Golden
                      Database reference guidelines.
                    </p>
                  </div>
                </div>
              )}

              {/* STATUS: PARTIAL or INCOMPLETE -> RENDER STEPS */}
              {(sv?.status === "partial" || sv?.status === "incomplete") && sv.steps && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-muted-foreground">
                    {sv.status === "incomplete"
                      ? "Some expected steps are missing from the draft. Missing steps are highlighted below:"
                      : "Some expected reference steps may need another look:"}
                  </p>

                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {sv.steps.map((stepItem: StructuralValidationStep) => {
                      const isMissing = stepItem.coverage === "missing";
                      const isPartial = stepItem.coverage === "partial";

                      return (
                        <div
                          key={stepItem.slNo}
                          className={`rounded-lg border p-2.5 text-xs transition-colors ${
                            isMissing
                              ? "border-rose-400/80 bg-rose-500/5 dark:bg-rose-950/20"
                              : isPartial
                              ? "border-amber-400/60 bg-amber-500/5 dark:bg-amber-950/15"
                              : "border-border/60 bg-muted/10 opacity-75"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <span className="text-[11px] text-muted-foreground">
                                {stepItem.slNo}.
                              </span>
                              <span>{stepItem.step}</span>
                            </span>

                            {isMissing && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40 font-semibold"
                              >
                                Missing
                              </Badge>
                            )}
                            {isPartial && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40 font-medium"
                              >
                                Partial
                              </Badge>
                            )}
                            {stepItem.coverage === "covered" && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                              >
                                Covered
                              </Badge>
                            )}
                          </div>

                          {/* Step Example */}
                          {stepItem.example && (
                            <div className="mt-1 text-[11px] text-muted-foreground bg-background/60 p-1.5 rounded border border-border/50">
                              <span className="font-medium text-foreground">Reference Example: </span>
                              {stepItem.example}
                            </div>
                          )}

                          {/* Suggestions */}
                          {stepItem.suggestion1 && (
                            <div className="mt-1.5 text-[11px] text-foreground flex items-start gap-1">
                              <span className="text-primary font-bold">•</span>
                              <span>{stepItem.suggestion1}</span>
                            </div>
                          )}
                          {stepItem.suggestion2 && (
                            <div className="mt-0.5 text-[11px] text-foreground flex items-start gap-1">
                              <span className="text-primary font-bold">•</span>
                              <span>{stepItem.suggestion2}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STATUS: NEEDS CLARIFICATION */}
              {sv?.status === "needs_clarification" && (
                <div className="p-3.5 rounded-lg border border-sky-500/30 bg-sky-500/5 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">
                        Reference clarification needed
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {sv.clarificationReason ||
                          "No confident reference match could be established because the question is out of scope or ambiguous."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* STATUS: REFERENCE DATA UNAVAILABLE */}
              {sv?.status === "reference_data_unavailable" && (
                <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">
                        Structure check is currently unavailable
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        The reference dataset could not be loaded at this time. This is a system-availability
                        notice and does not indicate an issue with your draft.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer info note */}
              <div className="pt-2 text-[10px] text-muted-foreground border-t border-border/60">
                Structural guidance is advisory and does not block draft submission.
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

