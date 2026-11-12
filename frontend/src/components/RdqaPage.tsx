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

export const RdqaPage = () => {
  const { data: currentUser } = useGetCurrentUser({});
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(subDays(new Date(), 1));
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
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

  const filteredQuestions = useMemo(() => {
    if (!questions) return [];
    if (!debouncedSearch.trim()) return questions;
    const searchLower = debouncedSearch.toLowerCase();
    return questions.filter(
      (q) =>
        q.question?.question?.toLowerCase().includes(searchLower) ||
        q.answer?.answer?.toLowerCase().includes(searchLower) ||
        q.question?.details?.crop?.toLowerCase().includes(searchLower) ||
        q.question?.details?.state?.toLowerCase().includes(searchLower)
    );
  }, [questions, debouncedSearch]);

  const totalQuestions = filteredQuestions.length;
  const totalPages = Math.ceil(totalQuestions / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, debouncedSearch]);

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
              <p className="text-muted-foreground">No questions found for this date.</p>
              <p className="text-xs text-muted-foreground">Try selecting a different date.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {paginatedQuestions.map((question) => {
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

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedQuestion(question)}
                          className="shrink-0"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
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
              {selectedChecks.length > 0 ? (
                <GdbFlagsPanel checks={selectedChecks} editable={false} />
              ) : (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center justify-between">
                  <span>The quality checks have not run on this answer yet.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isChecking}
                    onClick={() => {
                      const qId =
                        selectedQuestion.question?._id ||
                        selectedQuestion.questionId ||
                        selectedQuestion._id;
                      if (qId) {
                        checkQuestionsMutation([qId]);
                      }
                    }}
                  >
                    <CheckCheck className="h-4 w-4 mr-1 text-indigo-600" />
                    Check Now
                  </Button>
                </div>
              )}
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
