import { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  CheckCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RotateCw,
} from "lucide-react";
import { useRdqaQuestions, type RdqaQuestion } from "@/hooks/api/question/useRdqaQuestions";
import { useRdqaCheckQuestions } from "@/hooks/api/question/useRdqaCheckQuestions";
import { useBulkUploadStore } from "@/stores/bulk-upload-store";
import { GdbFlagsPanel } from "@/features/gdb-cleaning/components/GdbFlagsPanel";
import { HighlightedText } from "@/features/gdb-cleaning/components/HighlightedText";
import { effectiveResult } from "@/features/gdb-cleaning/types";
import { humanize } from "@/features/gdb-cleaning/utils";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Button } from "@/components/atoms/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { Calendar as CalendarComponent } from "@/components/atoms/calendar";
import { ScrollToTopButton } from "@/components/atoms/ScrollToTopButton";
import Spinner from "@/components/atoms/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/atoms/dialog";
import { Card, CardContent } from "@/components/atoms/card";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_HEIGHT_CLASSES = "h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-8.5rem)]";
const ITEMS_PER_PAGE = 12;
const API_LIMIT = 50;

function formatDateStr(date: Date | undefined): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function FormattedText({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-normal font-sans">
      {text}
    </pre>
  );
}

/** Check if an answer has been edited after its quality check was performed */
function isAnswerModifiedAfterCheck(question: RdqaQuestion | null | undefined): boolean {
  if (!question) return false;
  const checkedAt =
    question.checkedAt ||
    question.answer?.checkedAt ||
    question.question?.rdqaCheckedAt;
  const updatedAt = question.answer?.updatedAt;
  if (!checkedAt || !updatedAt) return false;
  const checkTime = new Date(checkedAt).getTime();
  const updateTime = new Date(updatedAt).getTime();
  // Buffer of 2 seconds to avoid any minor clock jitter during same-step updates
  return updateTime - checkTime > 2000;
}

type StatusFilter = "all" | "flagged" | "modified" | "clean" | "not_checked";

export const RdqaPage = () => {
  const { data: currentUser } = useGetCurrentUser({});
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(subDays(new Date(), 1));
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [checkingQuestionId, setCheckingQuestionId] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<RdqaQuestion | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const { data: rdqaResponse, isLoading, error } = useRdqaQuestions(formatDateStr(selectedDate), API_LIMIT);
  const { mutateAsync: checkQuestionsMutation, isPending: isCheckingMutation } = useRdqaCheckQuestions();

  const {
    operationType: bulkOpType,
    status: bulkStatus,
    processed: bulkProcessed,
    total: bulkTotal,
    passed: bulkPassed,
    flagged: bulkFlagged,
    failed: bulkFailed,
    latestLog: bulkLatestLog,
  } = useBulkUploadStore();

  const isRdqaChecking = bulkOpType === "rdqa_check" && bulkStatus === "running";
  const isChecking = isCheckingMutation || isRdqaChecking;

  const debouncedSearch = useDebounce(search, 300);

  const questions = rdqaResponse?.questions ?? [];

  // Keep selectedQuestion up to date when question list changes / refetches
  useEffect(() => {
    if (selectedQuestion) {
      const updated = questions.find(
        (q) =>
          q._id === selectedQuestion._id ||
          q.question?._id === selectedQuestion.question?._id
      );
      if (updated) {
        setSelectedQuestion(updated);
      }
    }
  }, [questions, selectedQuestion]);

  const filterCounts = useMemo(() => {
    let flagged = 0;
    let modified = 0;
    let clean = 0;
    let notChecked = 0;

    for (const q of questions) {
      const flags = q.flags || q.answer?.flags || q.question?.flags || [];
      const checks = q.checks || q.answer?.checks || q.question?.checks || [];
      const checkedAt = q.checkedAt || q.answer?.checkedAt || q.question?.rdqaCheckedAt;
      const isMod = isAnswerModifiedAfterCheck(q);

      if (isMod) modified++;
      if (flags.length > 0) {
        flagged++;
      } else if (checks.length > 0 || checkedAt) {
        clean++;
      } else {
        notChecked++;
      }
    }

    return { flagged, modified, clean, notChecked };
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    if (!questions) return [];

    let list = questions;
    if (statusFilter === "flagged") {
      list = list.filter((q) => {
        const flags = q.flags || q.answer?.flags || q.question?.flags || [];
        return flags.length > 0;
      });
    } else if (statusFilter === "modified") {
      list = list.filter((q) => isAnswerModifiedAfterCheck(q));
    } else if (statusFilter === "clean") {
      list = list.filter((q) => {
        const flags = q.flags || q.answer?.flags || q.question?.flags || [];
        const checks = q.checks || q.answer?.checks || q.question?.checks || [];
        const checkedAt = q.checkedAt || q.answer?.checkedAt || q.question?.rdqaCheckedAt;
        return flags.length === 0 && (checks.length > 0 || !!checkedAt);
      });
    } else if (statusFilter === "not_checked") {
      list = list.filter((q) => {
        const checks = q.checks || q.answer?.checks || q.question?.checks || [];
        const checkedAt = q.checkedAt || q.answer?.checkedAt || q.question?.rdqaCheckedAt;
        return checks.length === 0 && !checkedAt;
      });
    }

    if (!debouncedSearch.trim()) return list;
    const searchLower = debouncedSearch.toLowerCase();
    return list.filter(
      (q) =>
        q.question?.question?.toLowerCase().includes(searchLower) ||
        q.answer?.answer?.toLowerCase().includes(searchLower) ||
        q.question?.details?.crop?.toLowerCase().includes(searchLower) ||
        q.question?.details?.state?.toLowerCase().includes(searchLower)
    );
  }, [questions, statusFilter, debouncedSearch]);

  const totalQuestions = filteredQuestions.length;
  const totalPages = Math.ceil(totalQuestions / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, debouncedSearch, statusFilter]);

  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredQuestions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredQuestions, currentPage]);

  const handleRunCheck = async () => {
    const questionIds = questions
      .map((q) => q.question?._id || q.questionId || q._id)
      .filter(Boolean);

    if (questionIds.length === 0) {
      toast.error("No questions available to check for this date");
      return;
    }

    try {
      await checkQuestionsMutation(questionIds);
    } catch {
      // toast is handled in the mutation onError hook
    }
  };

  const handleRecheckSingle = async (questionId: string) => {
    if (!questionId) return;
    setCheckingQuestionId(questionId);
    try {
      await checkQuestionsMutation([questionId]);
    } catch {
      // toast is handled in the mutation hook
    } finally {
      setCheckingQuestionId(null);
    }
  };

  const selectedChecks = useMemo(() => {
    if (!selectedQuestion) return [];
    return (
      selectedQuestion.checks ||
      selectedQuestion.answer?.checks ||
      selectedQuestion.question?.checks ||
      []
    );
  }, [selectedQuestion]);

  const flaggedWords = useMemo(() => {
    if (!selectedChecks || selectedChecks.length === 0) return [];
    return selectedChecks
      .filter((check) => effectiveResult(check) === "FAIL")
      .flatMap((check) => check.highlight ?? []);
  }, [selectedChecks]);

  const percentage = Math.min(
    100,
    Math.max(0, Math.round((bulkProcessed / Math.max(1, bulkTotal)) * 100))
  );

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className={cn("flex items-center justify-center", PAGE_HEIGHT_CLASSES)}>
        <p className="text-muted-foreground">You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  return (
    <>
      <div className={cn("flex flex-col h-full overflow-hidden", PAGE_HEIGHT_CLASSES)}>
        {/* Top Header */}
        <div className="flex-shrink-0 border-b bg-background/50 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold">RDQA Review</h1>
              <p className="text-sm text-muted-foreground">Review finalized questions from a specific date</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Check button positioned to the left of the Details button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunCheck}
                disabled={isChecking || questions.length === 0}
                className="shrink-0"
              >
                {isChecking ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <CheckCheck className="h-4 w-4 mr-1 text-indigo-600 dark:text-indigo-400" />
                )}
                {isChecking ? "Checking..." : "Quality Check"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetailsModal(true)}
                className="shrink-0"
              >
                <BarChart3 className="h-4 w-4 mr-1" />
                Details
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto justify-start text-left font-normal shrink-0">
                    <Calendar className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Select Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                    disabled={(date) => date > new Date() || date < new Date("2020-01-01")}
                  />
                </PopoverContent>
              </Popover>

              <input
                type="text"
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex h-9 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Dedicated Processing Progress Tab/Banner when RDQA check is running */}
          {isRdqaChecking && (
            <div className="m-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                    RDQA Quality Check in Progress...
                  </span>
                </div>
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  {bulkProcessed} / {bulkTotal} ({percentage}%)
                </span>
              </div>
              <div className="h-2 w-full bg-indigo-100 dark:bg-indigo-900/60 rounded-full overflow-hidden mb-2.5">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 transition-all duration-300 rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground truncate max-w-[65%]">
                  {bulkLatestLog ? `💬 ${bulkLatestLog}` : "Evaluating quality checks on finalized answers..."}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    Passed: {bulkPassed}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400 font-semibold">
                    Flagged: {bulkFlagged}
                  </span>
                  {bulkFailed > 0 && (
                    <span className="text-rose-700 dark:text-rose-400 font-semibold">
                      Errors: {bulkFailed}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Status Filter Tabs */}
          {!isLoading && !error && questions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b bg-muted/20 text-xs">
              <span className="text-muted-foreground font-medium mr-1">Filter:</span>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "px-2.5 py-1 rounded-md border transition-all font-medium",
                  statusFilter === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background hover:bg-muted text-muted-foreground border-border"
                )}
              >
                All ({questions.length})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("flagged")}
                className={cn(
                  "px-2.5 py-1 rounded-md border transition-all font-medium inline-flex items-center gap-1.5",
                  statusFilter === "flagged"
                    ? "bg-red-600 text-white border-red-600 shadow-sm"
                    : "bg-background hover:bg-red-50 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", statusFilter === "flagged" ? "bg-white" : "bg-red-500")} />
                Flagged ({filterCounts.flagged})
              </button>

              {filterCounts.modified > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("modified")}
                  className={cn(
                    "px-2.5 py-1 rounded-md border transition-all font-medium inline-flex items-center gap-1.5",
                    statusFilter === "modified"
                      ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                      : "bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                  )}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  Modified ({filterCounts.modified})
                </button>
              )}

              <button
                type="button"
                onClick={() => setStatusFilter("clean")}
                className={cn(
                  "px-2.5 py-1 rounded-md border transition-all font-medium inline-flex items-center gap-1.5",
                  statusFilter === "clean"
                    ? "bg-green-600 text-white border-green-600 shadow-sm"
                    : "bg-background hover:bg-green-50 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900"
                )}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                No Flags ({filterCounts.clean})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("not_checked")}
                className={cn(
                  "px-2.5 py-1 rounded-md border transition-all font-medium",
                  statusFilter === "not_checked"
                    ? "bg-slate-700 text-white border-slate-700 shadow-sm"
                    : "bg-background hover:bg-muted text-muted-foreground border-border"
                )}
              >
                Not Checked ({filterCounts.notChecked})
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-muted-foreground">Failed to load questions.</p>
              <p className="text-xs text-muted-foreground">Please try again later.</p>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-muted-foreground">
                {questions.length === 0
                  ? "No questions found for this date."
                  : `No questions match the current filter (${statusFilter !== "all" ? statusFilter : "search"}).`}
              </p>
              {questions.length > 0 && statusFilter !== "all" ? (
                <Button variant="outline" size="sm" onClick={() => setStatusFilter("all")} className="mt-2">
                  Clear Filter
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Try selecting a different date.</p>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {paginatedQuestions.map((question) => {
                  const qId = question.question?._id || question.questionId || question._id;
                  const qChecks =
                    question.checks ||
                    question.answer?.checks ||
                    question.question?.checks ||
                    [];
                  const qFlags =
                    question.flags ||
                    question.answer?.flags ||
                    question.question?.flags ||
                    [];
                  const qNotEvaluated =
                    question.notEvaluated ||
                    question.answer?.notEvaluated ||
                    question.question?.notEvaluated ||
                    [];
                  const qCheckedAt =
                    question.checkedAt ||
                    question.answer?.checkedAt ||
                    question.question?.rdqaCheckedAt;
                  const isModified = isAnswerModifiedAfterCheck(question);
                  const isSingleChecking = checkingQuestionId === qId;

                  return (
                    <div
                      key={question._id}
                      className="border-b border-border p-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm leading-snug">
                            {question.question?.question || "N/A"}
                          </p>

                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {question.question?.details?.crop && (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                {question.question.details.crop}
                              </span>
                            )}
                            {question.question?.details?.state && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                {question.question.details.state}
                              </span>
                            )}
                            {question.closedAt && (
                              <span className="text-muted-foreground/70">
                                Closed: {new Date(question.closedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          {/* Quality Check Badges & Flags */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {isModified && (
                              <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 px-2 py-0.5 text-[11px] font-medium">
                                <AlertCircle className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400 shrink-0" />
                                Answer modified after check
                              </span>
                            )}
                            {qFlags.length > 0 ? (
                              <>
                                <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800 px-2 py-0.5 text-[11px] font-semibold">
                                  {qFlags.length} {qFlags.length === 1 ? "flag" : "flags"}
                                </span>
                                {qFlags.map((flag: string) => (
                                  <span
                                    key={flag}
                                    className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300"
                                  >
                                    {humanize(flag)}
                                  </span>
                                ))}
                              </>
                            ) : qChecks.length > 0 ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 border border-green-700 dark:bg-green-900/30 dark:text-green-300">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                No flags
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60 italic">
                                Not checked
                              </span>
                            )}
                            {qNotEvaluated.length > 0 && (
                              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                                {qNotEvaluated.length} could not run
                              </span>
                            )}
                            {qCheckedAt && (
                              <span className="text-[10px] text-muted-foreground/60 ml-1">
                                · Checked {new Date(qCheckedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isChecking}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRecheckSingle(qId);
                            }}
                            className={cn(
                              "h-8 px-2.5 text-xs font-medium gap-1",
                              isModified
                                ? "border-amber-300 bg-amber-50/80 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                            title={isModified ? "Answer was modified after last check - click to recheck" : "Run quality check on this answer"}
                          >
                            {isSingleChecking ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin text-indigo-600" />
                            ) : (
                              <RotateCw className="h-3.5 w-3.5 mr-1" />
                            )}
                            {isSingleChecking
                              ? "Checking..."
                              : isModified
                              ? "Recheck"
                              : qCheckedAt
                              ? "Recheck"
                              : "Check"}
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedQuestion(question)}
                            className="h-8 px-2.5 text-xs"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/50 sticky bottom-0">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{" "}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredQuestions.length)} of{" "}
                  {filteredQuestions.length} questions
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-3"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
                    disabled={currentPage >= (totalPages || 1)}
                    className="h-8 px-3"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
        <ScrollToTopButton />
      </div>

      {/* Question Details Modal */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedQuestion(null)} />
          <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-background p-6 shadow-lg m-4">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Question Details</h2>
                <div className="flex flex-wrap gap-2 text-xs">
                  {selectedQuestion.question?.details?.crop && (
                    <span className="rounded bg-green-100 px-2 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {selectedQuestion.question.details.crop}
                    </span>
                  )}
                  {selectedQuestion.question?.details?.state && (
                    <span className="rounded bg-blue-100 px-2 py-1 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {selectedQuestion.question.details.state}
                    </span>
                  )}
                  {selectedQuestion.question?.details?.district && (
                    <span className="rounded bg-purple-100 px-2 py-1 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {selectedQuestion.question.details.district}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedQuestion(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Question Text */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Question
              </h3>
              <div className="rounded-lg bg-muted/50 p-4">
                <FormattedText text={selectedQuestion.question?.question || "N/A"} />
              </div>
            </div>

            {/* Question Metadata */}
            <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium text-muted-foreground">Source:</span><p className="mt-0.5">{selectedQuestion.question?.source || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Status:</span><p className="mt-0.5">{selectedQuestion.question?.status || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Priority:</span><p className="mt-0.5">{selectedQuestion.question?.priority || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Auto Allocated:</span><p className="mt-0.5">{selectedQuestion.question?.isAutoAllocate ? "Yes" : "No"}</p></div>
              <div><span className="font-medium text-muted-foreground">Created:</span><p className="mt-0.5">{selectedQuestion.question?.createdAt ? new Date(selectedQuestion.question.createdAt).toLocaleString() : "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Closed:</span><p className="mt-0.5">{selectedQuestion.question?.closedAt ? new Date(selectedQuestion.question.closedAt).toLocaleString() : "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Season:</span><p className="mt-0.5">{selectedQuestion.question?.details?.season || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Domain:</span><p className="mt-0.5">{selectedQuestion.question?.details?.domain?.join(", ") || "N/A"}</p></div>
            </div>

            <div className="border-t my-6" />

            {/* Quality Checks & Flags Panel */}
            <div className="mb-6">
              {(() => {
                const modalQId =
                  selectedQuestion.question?._id ||
                  selectedQuestion.questionId ||
                  selectedQuestion._id;
                const isModalModified = isAnswerModifiedAfterCheck(selectedQuestion);
                const isModalChecking = checkingQuestionId === modalQId;

                return selectedChecks.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Quality Checks
                        </h3>
                        {isModalModified && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
                            <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600 shrink-0" />
                            Answer modified after last check
                          </span>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isChecking}
                        onClick={() => {
                          if (modalQId) handleRecheckSingle(modalQId);
                        }}
                        className={cn(
                          "h-7 text-xs gap-1.5",
                          isModalModified
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            : ""
                        )}
                      >
                        {isModalChecking ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                        ) : (
                          <RotateCw className="h-3.5 w-3.5" />
                        )}
                        {isModalChecking ? "Rechecking..." : isModalModified ? "Recheck Answer" : "Recheck"}
                      </Button>
                    </div>

                    <GdbFlagsPanel checks={selectedChecks} editable={false} />
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center justify-between">
                    <span>The quality checks have not run on this answer yet.</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isChecking}
                      onClick={() => {
                        if (modalQId) handleRecheckSingle(modalQId);
                      }}
                      className="gap-1.5"
                    >
                      {isModalChecking ? (
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                      ) : (
                        <CheckCheck className="h-4 w-4 text-indigo-600" />
                      )}
                      {isModalChecking ? "Checking..." : "Check Now"}
                    </Button>
                  </div>
                );
              })()}
            </div>

            <div className="border-t my-6" />

            {/* Final Answer Text (with flagged word highlights) */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Final Answer
                </h3>
                {flaggedWords.length > 0 && (
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                    Highlighted words flagged by checks
                  </span>
                )}
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                {flaggedWords.length > 0 ? (
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-normal font-sans">
                    <HighlightedText
                      text={selectedQuestion.answer?.answer || "No answer provided"}
                      words={flaggedWords}
                      className="bg-red-200 dark:bg-red-900/50 text-red-900 dark:text-red-200 font-semibold px-1 py-0.5 rounded"
                    />
                  </pre>
                ) : (
                  <FormattedText text={selectedQuestion.answer?.answer || "No answer provided"} />
                )}
              </div>
            </div>

            {/* Answer Metadata */}
            <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium text-muted-foreground">Approved By:</span><p className="mt-0.5">{selectedQuestion.answer?.approvedByEmail || selectedQuestion.answer?.approvedBy || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Author:</span><p className="mt-0.5">{selectedQuestion.authorIdEmail || selectedQuestion.authorId || "N/A"}</p></div>
              {selectedQuestion.answer?.modifiedBy && <div><span className="font-medium text-muted-foreground">Modified By:</span><p className="mt-0.5">{selectedQuestion.answer.modifiedBy}</p></div>}
              <div><span className="font-medium text-muted-foreground">Answer Status:</span><p className="mt-0.5">{selectedQuestion.answer?.status || "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Is Final Answer:</span><p className="mt-0.5">{selectedQuestion.answer?.isFinalAnswer ? "Yes" : "No"}</p></div>
              <div><span className="font-medium text-muted-foreground">Approval Count:</span><p className="mt-0.5">{selectedQuestion.answer?.approvalCount ?? "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Answer Created:</span><p className="mt-0.5">{selectedQuestion.answer?.createdAt ? new Date(selectedQuestion.answer.createdAt).toLocaleString() : "N/A"}</p></div>
              <div><span className="font-medium text-muted-foreground">Answer Updated:</span><p className="mt-0.5">{selectedQuestion.answer?.updatedAt ? new Date(selectedQuestion.answer.updatedAt).toLocaleString() : "N/A"}</p></div>
              <div>
                <span className="font-medium text-muted-foreground">Last Quality Check:</span>
                <p className="mt-0.5">
                  {selectedQuestion.checkedAt || selectedQuestion.answer?.checkedAt || selectedQuestion.question?.rdqaCheckedAt
                    ? new Date(
                        (selectedQuestion.checkedAt ||
                          selectedQuestion.answer?.checkedAt ||
                          selectedQuestion.question?.rdqaCheckedAt)!
                      ).toLocaleString()
                    : "Not evaluated yet"}
                </p>
              </div>
            </div>

            {/* Sources */}
            {selectedQuestion.answer?.sources && selectedQuestion.answer.sources.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sources</h3>
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  {selectedQuestion.answer.sources.map((source: any, index: number) => (
                    <div key={index} className="border-b border-border/50 last:border-0 pb-2 last:pb-0">
                      {source.sourceName && <p className="font-medium text-sm">{source.sourceName}</p>}
                      {source.source && (
                        <a
                          href={source.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline break-all block"
                        >
                          {source.source}
                        </a>
                      )}
                      {source.page && <p className="text-xs text-muted-foreground mt-1">Page: {source.page}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t my-6" />

            {/* Identifiers */}
            <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div><span className="font-medium">Question ID:</span><p className="mt-0.5 break-all">{selectedQuestion.question?._id || selectedQuestion.questionId || "N/A"}</p></div>
              <div><span className="font-medium">Answer ID:</span><p className="mt-0.5 break-all">{selectedQuestion.answer?._id || "N/A"}</p></div>
              <div><span className="font-medium">Context ID:</span><p className="mt-0.5 break-all">{selectedQuestion.context || "N/A"}</p></div>
              <div><span className="font-medium">Author ID:</span><p className="mt-0.5 break-all">{selectedQuestion.question?.userId || selectedQuestion.authorId || "N/A"}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>RDQA Distribution Details</DialogTitle>
            <DialogDescription>
              Overview of question distribution for {selectedDate ? format(selectedDate, "PPP") : "selected date"}
            </DialogDescription>
          </DialogHeader>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-primary">{rdqaResponse?.totalModerators ?? 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Total Moderators</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-primary">{rdqaResponse?.questionsPerModerator ?? 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Questions/Moderator</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-3xl font-bold text-primary">{rdqaResponse?.totalQuestions ?? 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Total Questions</p>
              </CardContent>
            </Card>
          </div>

          {/* Moderator Distribution */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Moderator Distribution</h3>
            <div className="space-y-3">
              {rdqaResponse?.moderatorDistribution?.map((moderator, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">{index + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{moderator.approvedByEmail || moderator.approvedBy}</p>
                      <p className="text-xs text-muted-foreground">
                        {moderator.totalAvailable} available · {moderator.selectedCount} selected
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (moderator.selectedCount / moderator.totalAvailable) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {Math.round((moderator.selectedCount / moderator.totalAvailable) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
              {(!rdqaResponse?.moderatorDistribution || rdqaResponse.moderatorDistribution.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No moderator data available</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
