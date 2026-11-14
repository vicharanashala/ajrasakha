import { useState, useMemo, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RotateCw,
  Pencil,
  Edit,
  Search,
  Sparkles,
  ShieldCheck,
  Clock,
  Copy,
  Check,
  ArrowUpDown,
  History,
  MoreVertical,
  X,
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
import { Badge } from "@/components/atoms/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { Calendar as CalendarComponent } from "@/components/atoms/calendar";
import { ScrollToTopButton } from "@/components/atoms/ScrollToTopButton";
import Spinner from "@/components/atoms/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/atoms/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/atoms/context-menu";
import { format, subDays, addDays, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { EditRdqaAnswerModal } from "./EditRdqaAnswerModal";
import { RdqaHistoryTimeline } from "./RdqaHistoryTimeline";
import { useQueryClient } from "@tanstack/react-query";
import { AddOrEditQuestionDialog } from "@/features/question-table-page/AddOrEditQuestionDialog";
import type { IDetailedQuestion, QuestionStatus, UserRole } from "@/types";
import { useUpdateQuestion } from "@/hooks/api/question/useUpdateQuestion";
import { toast } from "@/shared/components/toast";

// Convert RdqaQuestion to IDetailedQuestion for the full edit dialog
function convertRdqaToDetailedQuestion(rdqaQuestion: RdqaQuestion): IDetailedQuestion {
  return {
    _id: rdqaQuestion.question._id,
    userId: rdqaQuestion.authorId,
    question: rdqaQuestion.question.question,
    context: rdqaQuestion.context || "",
    aiInitialAnswer: rdqaQuestion.answer.answer,
    status: "closed" as QuestionStatus,
    totalAnswersCount: 1,
    priority: "medium",
    metrics: {
      mean_similarity: 0,
      std_similarity: 0,
      recent_similarity: 0,
      collusion_score: 0,
    },
    details: {
      state: rdqaQuestion.question.details?.state || "",
      district: rdqaQuestion.question.details?.district || "",
      crop: rdqaQuestion.question.details?.crop || "",
      season: "",
      domain: [],
    },
    source: "AJRASAKHA",
    createdAt: undefined,
    updatedAt: undefined,
    review_level_number: undefined,
    closedAt: rdqaQuestion.closedAt,
  };
}

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
  return updateTime - checkTime > 2000;
}

type StatusFilter = "all" | "flagged" | "modified" | "clean" | "not_checked";
type SortOption = "default" | "flags_desc" | "flags_asc" | "modified_first" | "crop_asc";

export const RdqaPage = () => {
  const { data: currentUser } = useGetCurrentUser({});
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(subDays(new Date(), 1));
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [checkingQuestionId, setCheckingQuestionId] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<RdqaQuestion | null>(null);
  const [detailsTab, setDetailsTab] = useState<string>("overview");
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editQuestion, setEditQuestion] = useState<RdqaQuestion | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Full edit dialog state
  const [fullEditQuestion, setFullEditQuestion] = useState<IDetailedQuestion | null>(null);
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(null);
  const [showFullEditModal, setShowFullEditModal] = useState(false);
  const { mutateAsync: updateQuestion, isPending: updatingQuestion } = useUpdateQuestion();

  const { data: rdqaResponse, isLoading, error, refetch, isFetching } = useRdqaQuestions(
    formatDateStr(selectedDate),
    API_LIMIT
  );
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

  const debouncedSearch = useDebounce(search, 250);

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

  const copyToClipboard = (text: string, id: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
  };

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

    const passRate =
      questions.length > 0 ? Math.round((clean / questions.length) * 100) : 0;

    return { flagged, modified, clean, notChecked, passRate };
  }, [questions]);

  const filteredAndSortedQuestions = useMemo(() => {
    if (!questions) return [];

    let list = [...questions];

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

    if (debouncedSearch.trim()) {
      const searchLower = debouncedSearch.toLowerCase();
      list = list.filter(
        (q) =>
          q.question?.question?.toLowerCase().includes(searchLower) ||
          q.answer?.answer?.toLowerCase().includes(searchLower) ||
          q.question?.details?.crop?.toLowerCase().includes(searchLower) ||
          q.question?.details?.state?.toLowerCase().includes(searchLower) ||
          q.question?.details?.district?.toLowerCase().includes(searchLower) ||
          q.answer?.approvedByEmail?.toLowerCase().includes(searchLower)
      );
    }

    if (sortOption === "flags_desc") {
      list.sort((a, b) => {
        const flagsA = (a.flags || a.answer?.flags || a.question?.flags || []).length;
        const flagsB = (b.flags || b.answer?.flags || b.question?.flags || []).length;
        return flagsB - flagsA;
      });
    } else if (sortOption === "flags_asc") {
      list.sort((a, b) => {
        const flagsA = (a.flags || a.answer?.flags || a.question?.flags || []).length;
        const flagsB = (b.flags || b.answer?.flags || b.question?.flags || []).length;
        return flagsA - flagsB;
      });
    } else if (sortOption === "modified_first") {
      list.sort((a, b) => {
        const modA = isAnswerModifiedAfterCheck(a) ? 1 : 0;
        const modB = isAnswerModifiedAfterCheck(b) ? 1 : 0;
        return modB - modA;
      });
    } else if (sortOption === "crop_asc") {
      list.sort((a, b) => {
        const cropA = (a.question?.details?.crop || "").toLowerCase();
        const cropB = (b.question?.details?.crop || "").toLowerCase();
        return cropA.localeCompare(cropB);
      });
    }

    return list;
  }, [questions, statusFilter, debouncedSearch, sortOption]);

  const totalQuestions = filteredAndSortedQuestions.length;
  const totalPages = Math.ceil(totalQuestions / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, debouncedSearch, statusFilter, sortOption]);

  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedQuestions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedQuestions, currentPage]);

  const handleRunCheck = async () => {
    if (!questions || questions.length === 0) {
      toast.error("No questions available to check for this date");
      return;
    }

    const questionIds = questions
      .map((q) => q.question?._id || q.questionId || q._id)
      .filter((id): id is string => Boolean(id));

    if (questionIds.length === 0) {
      toast.error("No questions available to check for this date");
      return;
    }

    try {
      await checkQuestionsMutation(questionIds);
    } catch {
      // handled in mutation hook
    }
  };

  const handleRecheckSingle = async (questionId: string) => {
    if (!questionId) return;
    setCheckingQuestionId(questionId);
    try {
      await checkQuestionsMutation([questionId]);
    } catch {
      // handled in hook
    } finally {
      setCheckingQuestionId(null);
    }
  };

  const handleFullEdit = (rdqaQuestion: RdqaQuestion) => {
    const detailedQuestion = convertRdqaToDetailedQuestion(rdqaQuestion);
    setFullEditQuestion(detailedQuestion);
    setUpdatedData(detailedQuestion);
    setShowFullEditModal(true);
  };

  const handleUpdateQuestion = async (
    mode: "add" | "edit",
    entityId?: string,
    _flagReason?: string,
    _status?: QuestionStatus
  ) => {
    try {
      if (!entityId) {
        toast.error(`Failed to identify and ${mode} the selected question.`);
        return;
      }

      if (!updatedData) return;

      if (!updatedData.question?.trim()) {
        toast.error("Question text is required.");
        return;
      }
      if (!updatedData.priority) {
        toast.error("Priority is required.");
        return;
      }
      if (!updatedData.details?.state?.trim()) {
        toast.error("State is required.");
        return;
      }
      if (!updatedData.details?.district?.trim()) {
        toast.error("District is required.");
        return;
      }
      if (!updatedData.details?.crop?.trim()) {
        toast.error("Crop is required.");
        return;
      }
      if (!updatedData.details?.season?.trim()) {
        toast.error("Season is required.");
        return;
      }
      if (!updatedData.details?.domain?.length) {
        toast.error("Domain is required.");
        return;
      }

      const original = fullEditQuestion;
      const changed: Partial<IDetailedQuestion> = { _id: entityId };

      if (original) {
        const editableKeys: (keyof IDetailedQuestion)[] = [
          "question",
          "context",
          "aiInitialAnswer",
          "priority",
          "status",
          "isTrainingQuestion",
        ];
        for (const key of editableKeys) {
          if (updatedData[key] !== original[key]) {
            (changed as Record<string, unknown>)[key] = updatedData[key];
          }
        }
        if (JSON.stringify(updatedData.details) !== JSON.stringify(original.details)) {
          changed.details = updatedData.details;
        }
        if (!!updatedData.isTesting !== !!original.isTesting) {
          changed.isTesting = !!updatedData.isTesting;
          changed.isAutoAllocate = !updatedData.isTesting;
        }
      } else {
        Object.assign(changed, updatedData);
      }

      await updateQuestion(changed);

      toast.success("Question updated successfully.");
      setShowFullEditModal(false);
      setFullEditQuestion(null);
      setUpdatedData(null);

      queryClient.invalidateQueries({ queryKey: ["rdqa-questions"] });
    } catch (error) {
      console.error("Error updating question:", error);
      toast.error("Failed to update question. Please try again.");
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

  const formattedDateTitle = selectedDate
    ? isToday(selectedDate)
      ? "Today"
      : isYesterday(selectedDate)
      ? "Yesterday"
      : format(selectedDate, "MMM d, yyyy")
    : "Pick Date";

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
          <AlertCircle className="w-5 h-5" />
        </div>
        <h2 className="text-base font-semibold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          You don&apos;t have administrative permissions to view the RDQA quality review dashboard.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Outer Page Container - Natural flow without forced fixed heights or nested scrollbars */}
      <div className="w-full flex flex-col space-y-4 pb-12">
        {/* Sleek Top Header Bar */}
        <header className="rounded-xl border border-border/70 bg-card/70 px-4 sm:px-6 py-3 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Title & Date Stepper */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                  RDQA Review
                </h1>
              </div>

              <span className="text-muted-foreground/30 hidden sm:inline">|</span>

              {/* Day-by-Day Stepper */}
              <div className="flex items-center rounded-lg border border-border/80 bg-background/80 p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDate((d) => (d ? subDays(d, 1) : subDays(new Date(), 1)))}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  title="Previous Day"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs sm:text-sm font-medium hover:bg-muted/60 rounded transition-colors text-foreground"
                    >
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{formattedDateTitle}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                      disabled={(date) => date > new Date() || date < new Date("2020-01-01")}
                    />
                  </PopoverContent>
                </Popover>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={selectedDate ? isToday(selectedDate) : false}
                  onClick={() => setSelectedDate((d) => (d ? addDays(d, 1) : new Date()))}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title="Next Day"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Actions: Refresh, Distribution, Run Check */}
            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                title="Refresh Questions"
              >
                <RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-primary")} />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetailsModal(true)}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5 shrink-0"
                title="View Moderator Distribution"
              >
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Distribution</span>
              </Button>

              <Button
                size="sm"
                onClick={handleRunCheck}
                disabled={isChecking || questions.length === 0}
                className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-2xs shrink-0"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Checking...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Run Quality Check</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </header>

        {/* Live Banner when Checking */}
        {isRdqaChecking && (
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-3 text-xs mb-2">
              <div className="flex items-center gap-2 font-medium text-indigo-950 dark:text-indigo-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span>Evaluating questions ({bulkProcessed} of {bulkTotal})</span>
                {bulkLatestLog && (
                  <span className="text-muted-foreground font-normal truncate max-w-xs hidden md:inline">
                    — {bulkLatestLog}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 font-medium text-[11px]">
                <span className="text-emerald-700 dark:text-emerald-400">Passed: {bulkPassed}</span>
                <span className="text-rose-700 dark:text-rose-400">Flagged: {bulkFlagged}</span>
                {bulkFailed > 0 && <span className="text-amber-700 dark:text-amber-400">Errors: {bulkFailed}</span>}
                <span className="font-mono text-muted-foreground">{percentage}%</span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-indigo-100 dark:bg-indigo-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-200 rounded-full"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Filter & Search Toolbar - Structured to guarantee NO overlap */}
        {!isLoading && !error && questions.length > 0 && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-border/60">
            {/* Left: Filter Tabs with Dots (no horizontal scrollbar on mobile) */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                  statusFilter === "all"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                All ({questions.length})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("flagged")}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0",
                  statusFilter === "flagged"
                    ? "bg-rose-600 text-white shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                Flagged ({filterCounts.flagged})
              </button>

              {filterCounts.modified > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("modified")}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0",
                    statusFilter === "modified"
                      ? "bg-amber-600 text-white shadow-2xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  Modified ({filterCounts.modified})
                </button>
              )}

              <button
                type="button"
                onClick={() => setStatusFilter("clean")}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0",
                  statusFilter === "clean"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                Passed ({filterCounts.clean})
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("not_checked")}
                className={cn(
                  "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0",
                  statusFilter === "not_checked"
                    ? "bg-foreground text-background shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                Pending ({filterCounts.notChecked})
              </button>
            </div>

            {/* Right: Search, Sort & Reset - immune to overlap */}
            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              {/* Search Bar */}
              <div className="relative flex-1 sm:w-64 sm:flex-initial">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search questions, crops..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-7 rounded-lg border border-input bg-background text-xs shadow-2xs transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    title="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Sort Dropdown */}
              <div className="w-36 shrink-0">
                <Select value={sortOption} onValueChange={(val: SortOption) => setSortOption(val)}>
                  <SelectTrigger className="h-8 w-full text-xs bg-background shrink-0">
                    <ArrowUpDown className="w-3 h-3 mr-1 text-muted-foreground shrink-0" />
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="default" className="text-xs">
                      Default
                    </SelectItem>
                    <SelectItem value="flags_desc" className="text-xs">
                      Most Flags
                    </SelectItem>
                    <SelectItem value="flags_asc" className="text-xs">
                      Fewest Flags
                    </SelectItem>
                    <SelectItem value="modified_first" className="text-xs">
                      Modified First
                    </SelectItem>
                    <SelectItem value="crop_asc" className="text-xs">
                      Crop (A-Z)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reset Filters Link */}
              {(statusFilter !== "all" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setSearch("");
                  }}
                  className="h-8 px-2.5 text-xs text-primary hover:text-primary/80 shrink-0 whitespace-nowrap"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Subtle Status Line */}
        {!isLoading && !error && questions.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-1">
            <span>
              Showing <strong className="text-foreground">{filteredAndSortedQuestions.length}</strong> of{" "}
              <strong className="text-foreground">{questions.length}</strong> questions
            </span>
            <span className="hidden sm:inline">
              {filterCounts.passRate}% pass rate · {filterCounts.flagged} flagged · {filterCounts.modified} modified
            </span>
          </div>
        )}

        {/* Main Listing Area - Natural page flow, NO inner scrollbar! */}
        <div className="w-full">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <Spinner />
              <p className="text-xs font-medium">Loading questions for review...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-center rounded-xl border border-destructive/20 bg-destructive/5 my-4">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h3 className="font-medium text-sm text-foreground">Failed to Load Questions</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                There was a problem communicating with the server. Please check your connection or retry.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2 text-xs gap-1.5">
                <RotateCw className="w-3 h-3" /> Retry
              </Button>
            </div>
          ) : filteredAndSortedQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center rounded-xl border border-dashed border-border bg-card my-4">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="font-medium text-sm text-foreground">No Questions Found</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                {questions.length === 0
                  ? `No finalized questions found for ${selectedDate ? format(selectedDate, "PPP") : "the selected date"}.`
                  : `No questions match the current filter or search criteria.`}
              </p>
              {questions.length > 0 && (statusFilter !== "all" || search) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setSearch("");
                  }}
                  className="mt-1 text-xs"
                >
                  Clear Filters
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Try choosing a different date using the stepper above.</p>
              )}
            </div>
          ) : (
            /* Question Cards - Proper block layout, NO overlapping! */
            <div className="flex flex-col gap-3">
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
                const qCheckedAt =
                  question.checkedAt ||
                  question.answer?.checkedAt ||
                  question.question?.rdqaCheckedAt;
                const isModified = isAnswerModifiedAfterCheck(question);
                const isSingleChecking = checkingQuestionId === qId;
                const isClean = qFlags.length === 0 && (qChecks.length > 0 || !!qCheckedAt);

                return (
                  <ContextMenu key={question._id}>
                    {/* asChild is critical to prevent Radix from wrapping in an inline span */}
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "w-full rounded-xl border p-4 transition-all duration-150 bg-card hover:bg-muted/20 shadow-2xs",
                          isModified
                            ? "border-amber-300 dark:border-amber-800"
                            : qFlags.length > 0
                            ? "border-rose-300 dark:border-rose-900"
                            : "border-border/80 hover:border-border"
                        )}
                      >
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          {/* Left Side: Information */}
                          <div className="min-w-0 flex-1 space-y-2">
                            {/* Meta line */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              {question.question?.details?.crop && (
                                <span className="font-semibold text-foreground">
                                  {question.question.details.crop}
                                </span>
                              )}
                              {question.question?.details?.state && (
                                <>
                                  <span>·</span>
                                  <span>{question.question.details.state}</span>
                                </>
                              )}
                              {question.question?.details?.district && (
                                <span>({question.question.details.district})</span>
                              )}
                              {question.closedAt && (
                                <>
                                  <span>·</span>
                                  <span>Closed {new Date(question.closedAt).toLocaleDateString()}</span>
                                </>
                              )}
                              {(question.answer?.approvedByEmail || question.approvedBy) && (
                                <>
                                  <span>·</span>
                                  <span className="truncate max-w-[220px]">
                                    Moderator:{" "}
                                    <strong className="text-foreground font-medium">
                                      {question.answer?.approvedByEmail || question.approvedBy}
                                    </strong>
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Question Title */}
                            <h3
                              onClick={() => {
                                setSelectedQuestion(question);
                                setDetailsTab("overview");
                              }}
                              className="font-semibold text-sm sm:text-base text-foreground leading-snug cursor-pointer hover:text-primary transition-colors"
                            >
                              {question.question?.question || "No question text"}
                            </h3>

                            {/* Answer Preview */}
                            {question.answer?.answer && (
                              <p
                                onClick={() => {
                                  setSelectedQuestion(question);
                                  setDetailsTab("overview");
                                }}
                                className="text-xs text-muted-foreground line-clamp-2 leading-relaxed cursor-pointer hover:text-foreground transition-colors"
                              >
                                <strong className="text-foreground/80 font-medium">Answer: </strong>
                                {question.answer.answer}
                              </p>
                            )}

                            {/* Flags List */}
                            {qFlags.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {qFlags.map((flag: string) => (
                                  <span
                                    key={flag}
                                    className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
                                  >
                                    {humanize(flag)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Right Side: Status Badge and Action Buttons */}
                          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/50">
                            {/* Status Badge */}
                            <div className="flex items-center gap-1.5">
                              {isModified && (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                  title="Answer was modified after last check"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                  Modified
                                </span>
                              )}
                              {qFlags.length > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                  {qFlags.length} {qFlags.length === 1 ? "flag" : "flags"}
                                </span>
                              ) : isClean ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  Passed
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] text-muted-foreground bg-muted">
                                  Not checked
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isChecking}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRecheckSingle(qId);
                                }}
                                className={cn(
                                  "h-8 px-2.5 text-xs font-medium gap-1 shrink-0",
                                  isModified && "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/80 dark:text-amber-200"
                                )}
                                title={isModified ? "Answer modified - recheck now" : "Recheck quality"}
                              >
                                {isSingleChecking ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                ) : (
                                  <RotateCw className="h-3.5 w-3.5" />
                                )}
                                <span>Recheck</span>
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedQuestion(question);
                                  setDetailsTab("overview");
                                }}
                                className="h-8 px-3 text-xs font-medium shrink-0"
                              >
                                Audit
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditQuestion(question);
                                  setShowEditModal(true);
                                }}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                                title="Edit Answer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 text-xs">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedQuestion(question);
                                      setDetailsTab("overview");
                                    }}
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5 mr-2" />
                                    View Quality Audit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedQuestion(question);
                                      setDetailsTab("history");
                                    }}
                                  >
                                    <History className="w-3.5 h-3.5 mr-2" />
                                    Check History
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleFullEdit(question)}>
                                    <Edit className="w-3.5 h-3.5 mr-2" />
                                    Edit Full Question
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() =>
                                      copyToClipboard(
                                        question.question?.question || "",
                                        `q-${question._id}`,
                                        "Question text"
                                      )
                                    }
                                  >
                                    <Copy className="w-3.5 h-3.5 mr-2" />
                                    Copy Question
                                  </DropdownMenuItem>
                                  {question.answer?.answer && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        copyToClipboard(
                                          question.answer.answer,
                                          `a-${question._id}`,
                                          "Answer text"
                                        )
                                      }
                                    >
                                      <Copy className="w-3.5 h-3.5 mr-2" />
                                      Copy Answer
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </div>
                    </ContextMenuTrigger>

                    <ContextMenuContent>
                      <ContextMenuItem
                        onSelect={(e) => {
                          setTimeout(() => {
                            e.preventDefault();
                            handleFullEdit(question);
                          }, 0);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Question Details
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => {
                          setEditQuestion(question);
                          setShowEditModal(true);
                        }}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Final Answer
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => handleRecheckSingle(qId)}>
                        <RotateCw className="w-4 h-4 mr-2" />
                        Recheck Quality
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => {
                          setSelectedQuestion(question);
                          setDetailsTab("overview");
                        }}
                      >
                        <ShieldCheck className="w-4 h-4 mr-2 text-primary" />
                        View Quality Audit
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => {
                          setSelectedQuestion(question);
                          setDetailsTab("history");
                        }}
                      >
                        <History className="w-4 h-4 mr-2" />
                        Audit History
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Pagination */}
        {!isLoading && !error && filteredAndSortedQuestions.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border/70 bg-card/70 shadow-2xs">
            <div className="text-xs text-muted-foreground">
              Showing <strong className="text-foreground">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to{" "}
              <strong className="text-foreground">
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedQuestions.length)}
              </strong>{" "}
              of <strong className="text-foreground">{filteredAndSortedQuestions.length}</strong> questions
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-2.5 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <span className="text-xs font-semibold px-2">
                Page {currentPage} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
                disabled={currentPage >= (totalPages || 1)}
                className="h-8 px-2.5 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        <ScrollToTopButton />
      </div>

      {/* Clean Audit Modal */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-card border shadow-xl overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    Question Audit
                  </h2>
                  {selectedQuestion.question?.details?.crop && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {selectedQuestion.question.details.crop}
                    </Badge>
                  )}
                  {selectedQuestion.question?.details?.state && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {selectedQuestion.question.details.state}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Reviewing automated rules, answer text, and historical evaluation runs
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedQuestion(null)}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Tabs */}
            <Tabs value={detailsTab} onValueChange={setDetailsTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-5 pt-2.5 border-b shrink-0 bg-muted/20">
                <TabsList className="bg-muted/70 p-0.5">
                  <TabsTrigger value="overview" className="text-xs py-1 px-3">
                    Question & Answer
                  </TabsTrigger>
                  <TabsTrigger value="rules" className="text-xs py-1 px-3">
                    Quality Rules
                    {selectedChecks.length > 0 && (
                      <span className="text-[10px] px-1 rounded-full bg-primary/20 text-primary font-bold ml-1.5">
                        {selectedChecks.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs py-1 px-3">
                    Check History
                  </TabsTrigger>
                  <TabsTrigger value="metadata" className="text-xs py-1 px-3">
                    Audit Info
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Tab 1: Overview */}
                <TabsContent value="overview" className="space-y-4 m-0 focus-visible:outline-none">
                  {/* Question */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Question
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            selectedQuestion.question?.question || "",
                            "modal-q",
                            "Question"
                          )
                        }
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                      >
                        {copiedId === "modal-q" ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copy
                      </Button>
                    </div>
                    <FormattedText text={selectedQuestion.question?.question || "N/A"} />
                    {selectedQuestion.context && (
                      <p className="pt-2 border-t text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Context: </span>
                        {selectedQuestion.context}
                      </p>
                    )}
                  </div>

                  {/* Final Answer */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Final Answer
                        </h4>
                        {flaggedWords.length > 0 && (
                          <Badge variant="destructive" className="text-[10px] font-semibold py-0">
                            {flaggedWords.length} flagged words
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            selectedQuestion.answer?.answer || "",
                            "modal-a",
                            "Answer"
                          )
                        }
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                      >
                        {copiedId === "modal-a" ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copy
                      </Button>
                    </div>

                    <div className="rounded-md bg-muted/30 p-3 text-sm leading-relaxed">
                      {flaggedWords.length > 0 ? (
                        <pre className="whitespace-pre-wrap break-words font-sans">
                          <HighlightedText
                            text={selectedQuestion.answer?.answer || "No answer provided"}
                            words={flaggedWords}
                            className="bg-rose-200 dark:bg-rose-950/80 text-rose-950 dark:text-rose-200 font-semibold px-1 py-0.5 rounded border border-rose-300 dark:border-rose-800"
                          />
                        </pre>
                      ) : (
                        <FormattedText text={selectedQuestion.answer?.answer || "No answer provided"} />
                      )}
                    </div>
                  </div>

                  {/* Sources */}
                  {selectedQuestion.answer?.sources && selectedQuestion.answer.sources.length > 0 && (
                    <div className="rounded-lg border p-4 space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Sources ({selectedQuestion.answer.sources.length})
                      </h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {selectedQuestion.answer.sources.map((source: any, index: number) => (
                          <div
                            key={index}
                            className="p-2.5 rounded-md border bg-muted/20 text-xs space-y-1"
                          >
                            {source.sourceName && (
                              <p className="font-semibold text-foreground">{source.sourceName}</p>
                            )}
                            {source.source && (
                              <a
                                href={source.source}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate block"
                              >
                                {source.source}
                              </a>
                            )}
                            {source.page && (
                              <p className="text-[11px] text-muted-foreground">Page: {source.page}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Quality Rules */}
                <TabsContent value="rules" className="space-y-3 m-0 focus-visible:outline-none">
                  {(() => {
                    const modalQId =
                      selectedQuestion.question?._id ||
                      selectedQuestion.questionId ||
                      selectedQuestion._id;
                    const isModalModified = isAnswerModifiedAfterCheck(selectedQuestion);
                    const isModalChecking = checkingQuestionId === modalQId;

                    return (
                      <div className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 border-b pb-3">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">
                              Automated Rule Evaluation
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              Verification evaluated against AI Answer Check server
                            </p>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isChecking}
                            onClick={() => {
                              if (modalQId) handleRecheckSingle(modalQId);
                            }}
                            className={cn(
                              "h-7 text-xs font-medium gap-1.5",
                              isModalModified && "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                            )}
                          >
                            {isModalChecking ? (
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            ) : (
                              <RotateCw className="h-3 w-3" />
                            )}
                            {isModalChecking
                              ? "Rechecking..."
                              : isModalModified
                              ? "Recheck Now"
                              : "Recheck"}
                          </Button>
                        </div>

                        {isModalModified && (
                          <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              Answer was edited after the last evaluation. Recheck is recommended to verify updated text.
                            </span>
                          </div>
                        )}

                        {selectedChecks.length > 0 ? (
                          <GdbFlagsPanel checks={selectedChecks} editable={false} />
                        ) : (
                          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground space-y-2">
                            <Clock className="w-6 h-6 mx-auto text-muted-foreground/60" />
                            <p>No quality check has been executed for this question yet.</p>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isChecking}
                              onClick={() => {
                                if (modalQId) handleRecheckSingle(modalQId);
                              }}
                              className="text-xs"
                            >
                              Run Check Now
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>

                {/* Tab 3: History */}
                <TabsContent value="history" className="m-0 focus-visible:outline-none">
                  <div className="rounded-lg border p-4">
                    <RdqaHistoryTimeline
                      questionId={
                        selectedQuestion.question?._id ||
                        selectedQuestion.questionId ||
                        selectedQuestion._id
                      }
                    />
                  </div>
                </TabsContent>

                {/* Tab 4: Metadata */}
                <TabsContent value="metadata" className="space-y-3 m-0 focus-visible:outline-none">
                  <div className="rounded-lg border p-4 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Audit Information
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-md bg-muted/20 border">
                        <span className="text-muted-foreground block text-[11px]">Moderator:</span>
                        <p className="font-medium text-foreground mt-0.5 truncate">
                          {selectedQuestion.answer?.approvedByEmail || selectedQuestion.answer?.approvedBy || "N/A"}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/20 border">
                        <span className="text-muted-foreground block text-[11px]">Author:</span>
                        <p className="font-medium text-foreground mt-0.5 truncate">
                          {selectedQuestion.authorIdEmail || selectedQuestion.authorId || "N/A"}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/20 border">
                        <span className="text-muted-foreground block text-[11px]">Closed At:</span>
                        <p className="font-medium text-foreground mt-0.5">
                          {selectedQuestion.question?.closedAt
                            ? new Date(selectedQuestion.question.closedAt).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/20 border">
                        <span className="text-muted-foreground block text-[11px]">Last Checked:</span>
                        <p className="font-medium text-foreground mt-0.5">
                          {selectedQuestion.checkedAt ||
                          selectedQuestion.answer?.checkedAt ||
                          selectedQuestion.question?.rdqaCheckedAt
                            ? new Date(
                                (selectedQuestion.checkedAt ||
                                  selectedQuestion.answer?.checkedAt ||
                                  selectedQuestion.question?.rdqaCheckedAt)!
                              ).toLocaleString()
                            : "Not evaluated"}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/20 border">
                        <span className="text-muted-foreground block text-[11px]">Location:</span>
                        <p className="font-medium text-foreground mt-0.5">
                          {selectedQuestion.question?.details?.district || "N/A"},{" "}
                          {selectedQuestion.question?.details?.state || "N/A"}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/20 border">
                        <span className="text-muted-foreground block text-[11px]">Crop & Season:</span>
                        <p className="font-medium text-foreground mt-0.5">
                          {selectedQuestion.question?.details?.crop || "N/A"}{" "}
                          {selectedQuestion.question?.details?.season
                            ? `(${selectedQuestion.question.details.season})`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>QID:</span>
                        <code className="font-mono bg-muted px-1 rounded text-[11px] text-foreground">
                          {selectedQuestion.question?._id || selectedQuestion.questionId}
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              selectedQuestion.question?._id || selectedQuestion.questionId || "",
                              "meta-qid",
                              "Question ID"
                            )
                          }
                          className="hover:text-foreground text-muted-foreground"
                        >
                          {copiedId === "meta-qid" ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t bg-muted/10 shrink-0">
              <span className="text-xs text-muted-foreground">
                Quality Status:{" "}
                <strong className="text-foreground font-medium">
                  {isAnswerModifiedAfterCheck(selectedQuestion)
                    ? "Modified (Needs Recheck)"
                    : (selectedQuestion.flags || selectedQuestion.answer?.flags || []).length > 0
                    ? `${(selectedQuestion.flags || selectedQuestion.answer?.flags || []).length} Flags`
                    : "Passed"}
                </strong>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditQuestion(selectedQuestion);
                    setShowEditModal(true);
                  }}
                  className="gap-1.5 text-xs h-8"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Answer
                </Button>
                <Button variant="default" size="sm" onClick={() => setSelectedQuestion(null)} className="text-xs h-8">
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Distribution Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4 text-primary" />
              RDQA Distribution Details
            </DialogTitle>
            <DialogDescription className="text-xs">
              Overview of question balancing and moderator workload for{" "}
              {selectedDate ? format(selectedDate, "PPP") : "the selected date"}
            </DialogDescription>
          </DialogHeader>

          {/* Minimal Stats Strip */}
          <div className="grid grid-cols-3 gap-2.5 my-3">
            <div className="rounded-lg border bg-muted/20 p-3 text-center">
              <p className="text-xl font-bold text-foreground">
                {rdqaResponse?.totalModerators ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Moderators</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-center">
              <p className="text-xl font-bold text-primary">
                {rdqaResponse?.questionsPerModerator ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Per Moderator</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 text-center">
              <p className="text-xl font-bold text-foreground">
                {rdqaResponse?.totalQuestions ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Total Questions</p>
            </div>
          </div>

          {/* Moderator Distribution Rows */}
          <div className="space-y-2 mt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Moderator Workload
            </h4>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {rdqaResponse?.moderatorDistribution?.map((moderator, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-xs"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {moderator.approvedByEmail || moderator.approvedBy}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {moderator.totalAvailable} available · {moderator.selectedCount} selected
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 sm:w-28 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (moderator.selectedCount / Math.max(1, moderator.totalAvailable)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">
                      {Math.round(
                        (moderator.selectedCount / Math.max(1, moderator.totalAvailable)) * 100
                      )}
                      %
                    </span>
                  </div>
                </div>
              ))}
              {(!rdqaResponse?.moderatorDistribution ||
                rdqaResponse.moderatorDistribution.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No moderator data available for this date.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit RDQA Answer Modal */}
      <EditRdqaAnswerModal
        question={editQuestion}
        open={showEditModal}
        onOpenChange={setShowEditModal}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["rdqa-questions"] });
        }}
      />

      {/* Full Question Edit Dialog */}
      <AddOrEditQuestionDialog
        open={showFullEditModal}
        setOpen={setShowFullEditModal}
        updatedData={updatedData}
        setUpdatedData={setUpdatedData}
        onSave={handleUpdateQuestion}
        question={fullEditQuestion}
        userRole={(currentUser?.role as UserRole) || "expert"}
        isLoadingAction={updatingQuestion}
        mode="edit"
      />
    </>
  );
};
