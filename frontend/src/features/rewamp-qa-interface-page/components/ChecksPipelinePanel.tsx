import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  ChevronUp,
  ChevronsRight,
  RefreshCw,
  Check,
  AlertCircle,
  HelpCircle,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/atoms/dialog";
import { toast } from "sonner";
import {
  useAnswerCheck,
} from "@/hooks/api/answer/useAnswerCheck";
import type { SourceItem } from "@/types";
import type { AnswerCheckItem } from "@/hooks/services/answerService";
import { PanelControls } from "./PanelControls";

export interface ChecksPipelinePanelProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isEnlarged?: boolean;
  onToggleEnlarge?: () => void;
  questionId?: string;
  questionText?: string;
  answerText?: string;
  crop?: string;
  state?: string;
  sources?: SourceItem[];
  answerId?: string;
}

// Metadata mapping for the 13 quality parameters
interface ParameterMeta {
  label: string;
  defaultPassText: string;
  category: "chemical" | "source" | "answer_quality" | "terminology";
}

const PARAMETER_META: Record<string, ParameterMeta> = {
  banned_chemical: {
    label: "Banned / restricted chemical",
    defaultPassText: "No banned chemicals detected",
    category: "chemical",
  },
  restricted_chemical: {
    label: "Restricted chemical check",
    defaultPassText: "No restricted chemicals detected",
    category: "chemical",
  },
  page_number_present: {
    label: "Page number present",
    defaultPassText: "All sources have page number",
    category: "source",
  },
  uniformity_of_dose: {
    label: "Dose & unit consistency",
    defaultPassText: "Units and dose format valid",
    category: "chemical",
  },
  source_present: {
    label: "Source citation present",
    defaultPassText: "Valid source attached to answer",
    category: "source",
  },
  local_name_mismatch: {
    label: "Language / translation check",
    defaultPassText: "Vernacular and local names verified",
    category: "terminology",
  },
  contextuality: {
    label: "Context completeness",
    defaultPassText: "Contextual to crop, state & season",
    category: "answer_quality",
  },
  source_fidelity: {
    label: "Source fidelity check",
    defaultPassText: "Dose aligns with referenced PoP source",
    category: "chemical",
  },
  answer_structure: {
    label: "Answer structure format",
    defaultPassText: "Matches standard answer template",
    category: "answer_quality",
  },
  query_properly_answered: {
    label: "Query resolution check",
    defaultPassText: "Directly addresses farmer's query",
    category: "answer_quality",
  },
  sequence: {
    label: "Recommendation sequence",
    defaultPassText: "Logical IPM sequence followed",
    category: "answer_quality",
  },
  private_product_name: {
    label: "Generic vs product name",
    defaultPassText: "Generic active ingredients used",
    category: "terminology",
  },
  officer_name: {
    label: "Officer name mention",
    defaultPassText: "No officer names mentioned",
    category: "terminology",
  },
};

export const ChecksPipelinePanel: React.FC<ChecksPipelinePanelProps> = ({
  isCollapsed = false,
  onToggleCollapse,
  isEnlarged = false,
  onToggleEnlarge,
  questionId,
  questionText = "",
  answerText = "",
  crop = "",
  state = "",
  sources = [],
  answerId,
}) => {
  const { startCheck, resetCheck, isChecking, report } = useAnswerCheck();
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "passed" | "flagged" | "not_evaluated">("all");

  const resetCheckRef = useRef(resetCheck);
  resetCheckRef.current = resetCheck;

  useEffect(() => {
    resetCheckRef.current?.();
  }, [questionId]);

  const handleRunChecks = () => {
    const hasQuestion = Boolean(questionText?.trim());
    const hasAnswer = Boolean(answerText?.trim());

    if (!hasQuestion && !hasAnswer) {
      toast.info("Please enter a question and draft answer before running validation checks.");
      return;
    }
    if (!hasQuestion) {
      toast.info("Question text is missing. Please select a valid question before running checks.");
      return;
    }
    if (!hasAnswer) {
      toast.info("Please enter or generate a draft answer before running validation checks.");
      return;
    }

    startCheck({
      question: questionText.trim(),
      answer: answerText.trim(),
      crop: crop || undefined,
      state: state || undefined,
      sources: sources.length > 0 ? sources : undefined,
      answerId: answerId || undefined,
    });
  };

  // Compute breakdown: Passed, Flagged, and Not Evaluated (matching API structure)
  const counts = useMemo(() => {
    if (!report?.checks || !Array.isArray(report.checks)) {
      return {
        passed: report?.passed ?? 0,
        flagged: report?.flagged ?? 0,
        notEvaluated: report?.notEvaluated ?? 0,
      };
    }

    let passed = 0;
    let flagged = 0;
    let notEvaluated = 0;

    for (const check of report.checks) {
      if (!check) continue;
      if (check.status === "PASS") {
        passed += 1;
      } else if (check.status === "FLAG") {
        flagged += 1;
      } else if (check.status === "NOT_EVALUATED") {
        notEvaluated += 1;
      }
    }

    return {
      passed: report.passed !== undefined ? report.passed : passed,
      flagged: report.flagged !== undefined ? report.flagged : flagged,
      notEvaluated: report.notEvaluated !== undefined ? report.notEvaluated : notEvaluated,
    };
  }, [report]);

  // Display checks (highlighting the top 6 key parameters like in the mockup)
  const displayChecks = useMemo(() => {
    if (!report?.checks || !Array.isArray(report.checks)) return [];

    const order = [
      "banned_chemical",
      "source_present",
      "page_number_present",
      "local_name_mismatch",
      "uniformity_of_dose",
      "contextuality",
    ];

    // Priority checks sorted according to the mockup
    const priorityChecks = order
      .map((key) => report.checks.find((c) => c?.parameter === key))
      .filter(Boolean) as AnswerCheckItem[];

    // Any remaining checks
    const remaining = report.checks.filter(
      (c) => c && !order.includes(c.parameter)
    );

    return [...priorityChecks, ...remaining].slice(0, 6);
  }, [report]);

  // Filtered checks for the detailed modal
  const modalChecks = useMemo(() => {
    if (!report?.checks || !Array.isArray(report.checks)) return [];
    return report.checks.filter((c) => {
      if (!c) return false;
      if (statusFilter === "passed" && c.status !== "PASS") return false;
      if (statusFilter === "flagged" && c.status !== "FLAG") return false;
      if (statusFilter === "not_evaluated" && c.status !== "NOT_EVALUATED") return false;
      return true;
    });
  }, [report, statusFilter]);

  if (isCollapsed && !isEnlarged) {
    return (
      <div className="h-full min-h-[260px] flex flex-col items-center justify-between py-4 px-2 bg-card border border-border rounded-xl shadow-xs transition-all duration-300 w-12">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-lg hover:bg-muted"
          title="Expand Checks / GDB Pipeline"
        >
          <ChevronsRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </Button>

        <div className="flex items-center gap-2 [writing-mode:vertical-rl] rotate-180 select-none py-4">
          <span className="text-xs font-semibold tracking-wide text-foreground">
            Checks / GDB Pipeline
          </span>
        </div>

        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      </div>
    );
  }

  return (
    <Card className="flex flex-col h-full border border-border bg-card shadow-xs rounded-xl overflow-hidden relative">
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border shrink-0">
        <p className="text-xs font-semibold text-foreground">
          Checks / GDB Cleaning Pipeline
        </p>

        <PanelControls
          isEnlarged={isEnlarged}
          onToggleEnlarge={onToggleEnlarge}
          onToggleCollapse={onToggleCollapse}
        />
      </div>

      <CardContent className="p-3.5 sm:p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* BODY CONTENT */}
        {isChecking ? (
          /* LOADING / PROCESSING STATE */
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 my-auto">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Running 13 Validation Checks...
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Evaluating chemical safety, dose fidelity, source citations,
                and linguistic formatting. This usually takes 25–45 seconds.
              </p>
            </div>
          </div>
        ) : !report ? (
          /* IDLE / EMPTY STATE */
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3 my-auto">
            <div className="w-12 h-12 rounded-full bg-muted/60 border border-border flex items-center justify-center text-muted-foreground">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-foreground">
                No Checks Run Yet
              </p>
              <p className="text-xs text-muted-foreground">
                Click <strong>Run Checks</strong> to validate this answer
                against banned chemicals, dosage consistency, and PoP sources.
              </p>
            </div>

            {/* Status indicators for Question and Draft Answer */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    questionText?.trim() ? "bg-emerald-500" : "bg-muted-foreground/40"
                  }`}
                />
                Question {questionText?.trim() ? "Ready" : "Missing"}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    answerText?.trim() ? "bg-emerald-500" : "bg-muted-foreground/40"
                  }`}
                />
                Draft Answer {answerText?.trim() ? "Ready" : "Empty"}
              </span>
            </div>

            <Button
              size="sm"
              onClick={handleRunChecks}
              className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Run Automated Checks
            </Button>
          </div>
        ) : (
          /* COMPLETED CHECK RESULTS */
          <div className="space-y-3.5 my-auto py-2 overflow-y-auto scrollbar-hiding">
            {/* 3 SUMMARY METRIC TABS */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {/* PASSED */}
              <div
                onClick={() => {
                  setStatusFilter("passed");
                  setIsDetailModalOpen(true);
                }}
                className="rounded-xl p-2.5 sm:p-3 bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/70 dark:border-emerald-800/40 flex items-center gap-2.5 sm:gap-3 transition-all hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer shadow-xs hover:shadow-sm"
                title="Click to view passed checks"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Check className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[3]" />
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-2xl font-bold text-emerald-900 dark:text-emerald-100 leading-none">
                    {counts.passed}
                  </div>
                  <div className="text-[10px] sm:text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                    Passed
                  </div>
                </div>
              </div>

              {/* FLAGGED */}
              <div
                onClick={() => {
                  setStatusFilter("flagged");
                  setIsDetailModalOpen(true);
                }}
                className="rounded-xl p-2.5 sm:p-3 bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/40 flex items-center gap-2.5 sm:gap-3 transition-all hover:border-amber-400 dark:hover:border-amber-600 cursor-pointer shadow-xs hover:shadow-sm"
                title="Click to view flagged checks"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <AlertCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-2xl font-bold text-amber-900 dark:text-amber-100 leading-none">
                    {counts.flagged}
                  </div>
                  <div className="text-[10px] sm:text-xs font-semibold text-amber-700 dark:text-amber-400 mt-1">
                    Flagged
                  </div>
                </div>
              </div>

              {/* NOT EVALUATED (Always included) */}
              <div
                onClick={() => {
                  setStatusFilter("not_evaluated");
                  setIsDetailModalOpen(true);
                }}
                className="rounded-xl p-2.5 sm:p-3 bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800/40 flex items-center gap-2.5 sm:gap-3 transition-all hover:border-slate-400 dark:hover:border-slate-600 cursor-pointer shadow-xs hover:shadow-sm"
                title="Click to view not-evaluated checks"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-400 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <HelpCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
                </div>
                <div className="min-w-0">
                  <div className="text-base sm:text-2xl font-bold text-slate-800 dark:text-slate-200 leading-none">
                    {counts.notEvaluated}
                  </div>
                  <div className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">
                    Not Evaluated
                  </div>
                </div>
              </div>
            </div>

            {/* CHECKS LIST (2-COLUMN RESPONSIVE GRID) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5">
              {displayChecks.map((item) => {
                const meta = PARAMETER_META[item.parameter] || {
                  label: item.parameter.replace(/_/g, " "),
                  defaultPassText: "Requirement verified",
                  category: item.category,
                };

                const isPass = item.status === "PASS";
                const isFlag = item.status === "FLAG";
                const displayReason = item.reason || meta.defaultPassText;

                return (
                  <div
                    key={item.parameter}
                    className={`p-2.5 sm:p-3 rounded-xl border transition-all flex items-center justify-between gap-3 shadow-2xs ${
                      isPass
                        ? "border-border/70 bg-card hover:bg-muted/15"
                        : isFlag
                        ? "border-amber-200/70 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-950/15"
                        : "border-border/60 bg-muted/20"
                    }`}
                  >
                    {/* Left Icon & Text */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isPass ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : isFlag ? (
                        <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                          <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-slate-400 text-white flex items-center justify-center shrink-0">
                          <HelpCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {meta.label}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate leading-snug">
                          {displayReason}
                        </div>
                      </div>
                    </div>

                    {/* Right Pill Badge */}
                    <div className="shrink-0">
                      {isPass ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 tracking-wider">
                          PASS
                        </span>
                      ) : isFlag ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 tracking-wider">
                          FLAG
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground tracking-wider">
                          N/A
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* BOTTOM FOOTER: VIEW DETAILED REPORT & RUN CHECKS AGAIN */}
        <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2 text-xs mt-auto">
          <button
            type="button"
            disabled={!report}
            onClick={() => {
              setStatusFilter("all");
              setIsDetailModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>View Detailed Report</span>
          </button>

          {report && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunChecks}
              disabled={isChecking}
              className="h-7 px-2.5 text-xs font-medium rounded-lg border-border/80 hover:bg-muted text-foreground flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <RefreshCw
                className={`w-3 h-3 text-muted-foreground ${
                  isChecking ? "animate-spin text-primary" : ""
                }`}
              />
              <span>{isChecking ? "Checking..." : "Run Checks Again"}</span>
            </Button>
          )}
        </div>
      </CardContent>

      {/* FULL DETAILED REPORT DIALOG */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-3xl md:max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-background border-border shadow-xl">
          {/* MODAL HEADER: Title on top (with pr for close button), Status filter tabs below heading */}
          <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border/60 bg-muted/20 shrink-0 space-y-3">
            {/* Top row: Title + Count info with dedicated padding on the right to prevent close button collision */}
            <div className="flex items-center justify-between gap-3 pr-8 sm:pr-10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-sm sm:text-base font-bold text-foreground truncate">
                    GDB Cleaning Pipeline Report
                  </DialogTitle>
                  <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                    Automated validation checks ({report?.checks?.length ?? 13} quality checks)
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom row: Status Filter Tabs (placed below the heading, responsive horizontal scroll) */}
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 w-full">
              {/* ALL */}
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border font-medium ${
                  statusFilter === "all"
                    ? "bg-background text-foreground shadow-xs font-semibold border-border"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-background/60"
                }`}
              >
                <span>All Checks</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    statusFilter === "all"
                      ? "bg-muted text-foreground font-bold"
                      : "bg-muted/80 text-muted-foreground"
                  }`}
                >
                  {report?.checks?.length ?? 0}
                </span>
              </button>

              {/* PASSED */}
              <button
                type="button"
                onClick={() => setStatusFilter("passed")}
                className={`h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border font-medium ${
                  statusFilter === "passed"
                    ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700 shadow-xs font-semibold"
                    : "border-transparent text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/10"
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5] text-emerald-600 dark:text-emerald-400" />
                <span>Passed</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 font-bold">
                  {counts.passed}
                </span>
              </button>

              {/* FLAGGED */}
              <button
                type="button"
                onClick={() => setStatusFilter("flagged")}
                className={`h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border font-medium ${
                  statusFilter === "flagged"
                    ? "bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border-amber-300 dark:border-amber-700 shadow-xs font-semibold"
                    : "border-transparent text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-500/10"
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 stroke-[2.5] text-amber-600 dark:text-amber-400" />
                <span>Flagged</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 font-bold">
                  {counts.flagged}
                </span>
              </button>

              {/* NOT EVALUATED */}
              <button
                type="button"
                onClick={() => setStatusFilter("not_evaluated")}
                className={`h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border font-medium ${
                  statusFilter === "not_evaluated"
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800/80 dark:text-slate-100 border-slate-300 dark:border-slate-600 shadow-xs font-semibold"
                    : "border-transparent text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-500/10"
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5 stroke-[2.5] text-slate-500 dark:text-slate-400" />
                <span>Not Evaluated</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300 font-bold">
                  {counts.notEvaluated}
                </span>
              </button>
            </div>
          </div>

          {/* Modal Body: Clean Check cards list */}
          <div className="p-3.5 sm:p-5 overflow-y-auto space-y-2.5 flex-1 min-h-0">
            {modalChecks.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs space-y-1">
                <HelpCircle className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="font-semibold text-foreground">No checks in this view</p>
                <p>There are no checks matching the selected filter criteria.</p>
              </div>
            ) : (
              modalChecks.map((check) => {
                const meta = PARAMETER_META[check.parameter] || {
                  label: check.parameter.replace(/_/g, " "),
                  defaultPassText: "Verified",
                  category: check.category,
                };

                const isPass = check.status === "PASS";
                const isFlag = check.status === "FLAG";

                return (
                  <div
                    key={check.parameter}
                    className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
                      isPass
                        ? "border-emerald-200/50 dark:border-emerald-900/30 bg-emerald-50/20 dark:bg-emerald-950/10"
                        : isFlag
                        ? "border-amber-300/70 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-950/15"
                        : "border-border/60 bg-muted/20"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
                      <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                        {isPass ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : isFlag ? (
                          <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                            <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-slate-400 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                            <HelpCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                          </div>
                        )}

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground">
                              {meta.label}
                            </span>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1.5 py-0.2 rounded bg-muted/60">
                              {meta.category.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed break-words [overflow-wrap:anywhere]">
                            {check.reason || meta.defaultPassText}
                          </p>
                        </div>
                      </div>

                      <div className="flex sm:block justify-end shrink-0 pl-8 sm:pl-0">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider inline-block text-center ${
                            isPass
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : isFlag
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isPass ? "PASS" : isFlag ? "FLAG" : "NOT EVALUATED"}
                        </span>
                      </div>
                    </div>

                    {/* Highlights (if any word/token was flagged) */}
                    {check.highlight && check.highlight.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center gap-1.5 flex-wrap pl-0 sm:pl-9">
                        <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
                          Detected:
                        </span>
                        {check.highlight.map((h, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 font-mono text-[11px] font-semibold border border-amber-300/60 dark:border-amber-800/40 break-all"
                          >
                            "{h}"
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
