import { useEffect, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/atoms/tooltip";
import { Button } from "../../components/atoms/button";
import { Input } from "../../components/atoms/input";

import { Badge } from "../../components/atoms/badge";
import { Select, SelectTrigger, SelectItem, SelectContent, SelectValue } from "../../components/atoms/select";

import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Clock,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Trash,
  X,
  Filter,
  LayoutGrid,
  ArrowUpDown,
  Activity,
  EyeOff,
  Eye,
  Cpu,
  ChevronDown,
  ChevronUp,
  Loader2,
  Beaker,
  MessageSquare,
  MessageCircle,
  AlertTriangle,
  Download,
} from "lucide-react";
import { useGetQuestionStatusSummary } from "@/hooks/api/question/useGetQuestionStatusSummary";
import {
  AdvanceFilterDialog,
  type AdvanceFilterValues,
} from "../../components/advanced-question-filter";
import type {
  IDetailedQuestion,
  IMyPreference,
  IUser,
  QuestionSource,
  QuestionStatus,
  UserRole,
} from "@/types";
import { toast } from "sonner";
import { ConfirmationModal } from "../../components/confirmation-modal";
import { OutreachReportModal } from "@/features/question_details/components/OutreachReport";
import { useAddQuestion } from "@/hooks/api/question/useAddQuestion";
import { useNavigate } from "@tanstack/react-router";

import {
  AddOrEditQuestionDialog,
  type AddQuestionValidationErrors,
} from "./AddOrEditQuestionDialog";
import { useReAllocateLessWorkload, useReAllocateExpertsSelectedQuestions } from "@/hooks/api/question/useReAllocateLessWorkload";
import { DownloadReportButton } from "./DownloadReportButton";
import { DownloadOverallReportButton } from "./DownloadOverallReportButton";
import { DownloadFilteredReportButton } from "./DownloadFilteredReportButton";
import { DownloadDuplicateReportButton } from "./DownloadDuplicateReportButton";
import {
  allModeColumns,
  commonColumns,
  reviewModeColumns,
  useQuestionTableStore,
} from "@/stores/all-questions";
import ViewDropdown from "../questions/components/ViewDropdown";
import DownloadLevelWiseReportButton from "./DownloadLevelWiseReportButton";
import { CropManagementModal } from "./CropManagementModal";
import { QueueDetailsModal, GateKeeperAuditorQueueModal } from "./QueueDetailsModal";
import { canViewQueueDetails } from "@/lib/roles";
import { ChemicalManagementModal } from "./ChemicalManagementModal";
import { CropService } from "@/hooks/services/cropService";
import { AnswerModeSwitcher } from "./AnswerModeSwitcher";
import { BulkUploadAllocationModal } from "./BulkUploadAllocationModal";
import { UserCheck } from "lucide-react";
import { ReallocationManualModal } from "../../components/ReallocationManualModal";

import { TopRightBadge } from "@/components/NewBadge";
import DownloadShiftWiseReportButton from "./DownloadShiftWiseReportButton";

type QuestionsFiltersProps = {
  search: string;
  states: string[];
  appliedFilters: AdvanceFilterValues;
  onChange: (next: AdvanceFilterValues) => void;
  crops: string[];
  onReset: () => void;
  setSearch: (val: string) => void;
  setUploadedQuestionsCount: (val: number) => void;
  setIsBulkUpload: (val: boolean) => void;
  refetch: () => void;
  totalQuestions: number;
  currentUser?: IUser;
  userRole: UserRole;
  isSelectionModeOn: boolean;
  bulkDeletingQuestions: boolean;
  handleBulkDelete: () => void;
  selectedQuestionIds: string[];
  setIsSelectionModeOn: (value: boolean) => void;
  setSelectedQuestionIds: (value: string[]) => void;
  viewMode: "all" | "review-level" | "dedicated";
  setViewMode: (v: "all" | "review-level" | "dedicated") => void;
  sort: string;
  onSort: (key: string) => void;
  showClosedAt?: boolean;
  view: "grid" | "table";
  setView: (v: "grid" | "table") => void;
  handleBulkAllocateToPae: (paeExpertId: string) => Promise<void>;
  isBulkAllocatingPae: boolean;
  onAnswerModeChange?: (mode: string) => void;
};

type AnswerMode = "ajraskha" | "manual" | "whatsapp" | "outreach" | "draft" | "pae" | "non_agri" | "dynamic" | "search" | "training";

const filterToAnswerMode = (filter: AdvanceFilterValues): AnswerMode => {
  if (filter.is_non_agri === true) return "non_agri";
  if (filter.pae_review === true) return "pae";
  if (filter.status === "draft") return "draft";
  if (filter.status === "dynamic") return "dynamic";
  if (filter.source === "AGRI_EXPERT") return "manual";
  if (filter.source === "WHATSAPP") return "whatsapp";
  if (filter.source === "OUTREACH") return "outreach";
  if (filter.isTrainingQuestion === true) return "training";
  return "ajraskha";
};

const answerModeToSource = (
  answerMode: AnswerMode,
): AdvanceFilterValues["source"] => {
  if (answerMode === "manual") return "AGRI_EXPERT";
  if (answerMode === "whatsapp") return "WHATSAPP";
  if (answerMode === "outreach") return "OUTREACH";
  if (answerMode === "draft" || answerMode === "pae" || answerMode === "non_agri" || answerMode === "dynamic") return "all";
  return "AJRASAKHA";
};

export const QuestionsFilters = ({
  search,
  setSearch,
  appliedFilters,
  setUploadedQuestionsCount,
  setIsBulkUpload,
  crops,
  states,
  onChange,
  onReset,
  refetch,
  totalQuestions,
  currentUser,
  userRole,
  isSelectionModeOn,
  handleBulkDelete,
  selectedQuestionIds,
  setSelectedQuestionIds,
  setIsSelectionModeOn,
  bulkDeletingQuestions,
  viewMode,
  setViewMode,
  sort,
  onSort,
  showClosedAt,
  view,
  setView,
  handleBulkAllocateToPae,
  isBulkAllocatingPae,
  onAnswerModeChange,
}: QuestionsFiltersProps) => {
  const navigate = useNavigate();
  //question global state
  const { visibleColumns, toggleColumn } = useQuestionTableStore();
  const activeColumns = [
    ...commonColumns,
    ...(viewMode === "all" ? allModeColumns : reviewModeColumns),
  ];
  const [advanceFilter, setAdvanceFilterValues] =
    useState<AdvanceFilterValues>(appliedFilters);
  const [previousFilter, setPreviousFilter] =
    useState<AdvanceFilterValues | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuestionErrors, setAddQuestionErrors] =
    useState<AddQuestionValidationErrors>({});
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
    null,
  );
  const [answerMode, setAnswerMode] = useState<AnswerMode>(() =>
    filterToAnswerMode(appliedFilters),
  );
  const prevAnswerModeRef = useRef<AnswerMode>(filterToAnswerMode(appliedFilters));
  const isTrainingUser = currentUser?.isTrainingUser === true;

  const { mutateAsync: addQuestion, isPending: addingQuestion } =
    useAddQuestion((count, isBulkUpload) => {
      setUploadedQuestionsCount(count);
      setIsBulkUpload(isBulkUpload);
    });
  const { mutateAsync: reAllocateLessWorkload, isPending: reAllocateQuestion } =
    useReAllocateLessWorkload();
  // Reallocate the selected questions to experts with less workload
  const { mutateAsync: reAllocateExpertsSelectedQuestions, isPending: reAllocating } =
    useReAllocateExpertsSelectedQuestions();

  const [isReAllocateOpen, setIsReAllocateOpen] = useState(false);
  const [isReAllocateSelectedQuestionsOpen, setIsReAllocateSelectedQuestionsOpen] = useState(false);
  const [isReAllocateDisabled, setIsReAllocateDisabled] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isChemicalModalOpen, setIsChemicalModalOpen] = useState(false);
  const [isDownloadingCrops, setIsDownloadingCrops] = useState(false);
  const [isDownloadingChemicals, setIsDownloadingChemicals] = useState(false);
  const [isPaeAllocateModalOpen, setIsPaeAllocateModalOpen] = useState(false);
  const [isManualReallocateOpen, setIsManualReallocateOpen] = useState(false);
  const [manualReallocateType, setManualReallocateType] = useState<"inactive" | "escalation">("inactive");
  const [pendingReallocateType, setPendingReallocateType] = useState<"inactive" | "escalation" | null>(null);

  useEffect(() => {
    if (!isReAllocateOpen && pendingReallocateType) {
      setManualReallocateType(pendingReallocateType);
      setIsManualReallocateOpen(true);
      setPendingReallocateType(null);
    }
  }, [isReAllocateOpen, pendingReallocateType]);

  const handleReAllocateLessWorkload = async (type?: string) => {
    try {
      setIsReAllocateDisabled(true);
      const res = await reAllocateLessWorkload(type);

      if (!res) {
        toast.error("No response from server");
        setIsReAllocateDisabled(false);
        return;
      }
      if (res.message === "Workload balancing started in background" || res.message === "Inactive-to-Active reallocation started in background") {
        toast.success(
          "Workload balancing has started in the background. Please wait 50 seconds before reallocating again.",
        );

        // Show detailed toast if it was an inactive-to-active reallocation
        if (type === "inactive") {
          toast.info(
            `Found ${res.inactiveExpertsFound || 0} inactive experts. Reallocating ${res.submissionsProcessed || 0} tasks to ${res.expertsInvolved || 0} active experts.`,
            { duration: 6000 }
          );
        }

        // Re-enable button after 50 seconds
        setTimeout(() => {
          setIsReAllocateDisabled(false);
        }, 50000);
        // Any other message from backend
        toast.success(res.message);
        setIsReAllocateDisabled(false);
      }
      refetch();
    } catch (error) {
      toast.error(
        "Failed to reAllocate question for those who has less workload",
      );
      console.error(
        "Error reAllocating question who has less workload question:",
        error,
      );
      setIsReAllocateDisabled(false);
    }
  };

  //reAllocate selected questions to experts with less workload
  const handleReAllocateSelectedQuestions = async () => {
    try {
      setIsReAllocateDisabled(true);
      const res = await reAllocateExpertsSelectedQuestions(selectedQuestionIds);

      if (!res) {
        toast.error("No response from server");
        return;
      }
      if (res.message === "Workload balancing started in background") {
        toast.success(
          res.submissionsProcessed === 0
            ? `No questions were reallocated.${res.questionsFiltered
              ? ` ${res.questionsFiltered} questions were filtered due to invalid status.`
              : ""
            }`
            : `${res.submissionsProcessed} questions were successfully reallocated out of ${selectedQuestionIds.length} selected questions.${res.questionsFiltered
              ? ` ${res.questionsFiltered} questions were filtered due to invalid status.`
              : ""
            }${res.unallocatedQuestions
              ? ` ${res.unallocatedQuestions} questions could not be reallocated because no eligible new experts were available.`
              : ""
            } Please wait 50 seconds before reallocating again.`
        );
        // Re-enable button after 30 seconds
        setTimeout(() => {
          setIsReAllocateDisabled(false);
        }, 50000);
        // Any other message from backend
        toast.success(res.message);
        setIsReAllocateDisabled(false);
      }
      refetch();
    } catch (error) {
      toast.error(
        "Failed to reAllocate selected question",
      );
      console.error(
        "Error reallocating selected question:",
        error,
      );
      setIsReAllocateDisabled(false);
    } finally {
      setIsSelectionModeOn(false);
      setSelectedQuestionIds([]);
    }
  };

  const handleAddQuestion = async (
    mode: "add" | "edit",
    _entityId?: string,
    _flagReason?: string,
    _status?: QuestionStatus,
    formData?: FormData,
  ) => {
    try {
      if (mode !== "add") return;
      if (formData) {
        const isOutreach = formData.get("isOutreachQuestion") === "true";
        const isTrainingQuestion = formData.get("isTrainingQuestion") === "true";
        await addQuestion(formData as any);
        // toast.success('File Uploaded succesfully')
        handleAnswerModeChange(
          isTrainingQuestion ? "training" : isOutreach ? "outreach" : "manual",
        );
        setAddQuestionErrors({});
        setAddOpen(false);
        return;
      }
      if (!updatedData) {
        setAddQuestionErrors({
          question: "No data found to add. Please try again.",
        });
        return;
      }

      const payload = {
        question: updatedData.question?.trim() ?? "",
        priority: updatedData.priority ?? "medium",
        status: (updatedData.status || "open") as QuestionStatus,
        source: "AGRI_EXPERT" as QuestionSource,
        details: updatedData.details,
        context: updatedData.context || "",
        aiInitialAnswer: updatedData.aiInitialAnswer || "",
        isTrainingQuestion: updatedData.isTrainingQuestion ?? false,
      };

      const validationErrors: AddQuestionValidationErrors = {};

      if (!payload.question) {
        validationErrors.question =
          "Please enter a question before submitting.";
      } else if (payload.question.length < 10) {
        validationErrors.question =
          "Question must be at least 10 characters long.";
      }

      if (!payload.priority) {
        validationErrors.priority =
          "Please select a priority (Low, Medium, or High).";
      } else if (!["low", "medium", "high"].includes(payload.priority)) {
        validationErrors.priority =
          "Invalid priority value. Please reselect from the options.";
      }

      if (!payload.details) {
        setAddQuestionErrors({
          state: "Please fill in the question details.",
        });
        return;
      }

      const { state, district, crop, season, domain } = payload.details;

      if (!state?.trim()) {
        validationErrors.state = "Please select the State field.";
      }

      if (!district?.trim()) {
        validationErrors.district = "Please enter the District field.";
      }

      if (!crop?.trim()) {
        validationErrors.crop = "Please select the Crop field.";
      }

      if (!season?.trim()) {
        validationErrors.season = "Please select the Season field.";
      }

      if (!domain?.length) {
        validationErrors.domain = "Please select the Domain field.";
      }
      else if(domain.length>3){
        validationErrors.domain = "Only three domain is allowed."
      }

      if (Object.keys(validationErrors).length > 0) {
        setAddQuestionErrors(validationErrors);
        return;
      }

      setAddQuestionErrors({});
      await addQuestion(payload);
      // toast.success("Question added successfully.");
      handleAnswerModeChange("manual");
      setAddOpen(false);
    } catch (error) {
      console.error("Error in handleAddQuestion:", error);
      // toast.error("An unexpected error occurred. Please try again.");
      setAddOpen(false);
    }
  };

  const cropService = new CropService();

  const handleDownloadCrops = async () => {
    setIsDownloadingCrops(true);
    try {
      const blob = await cropService.downloadList('crop');
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "crops_list.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download crops list.");
    } finally {
      setIsDownloadingCrops(false);
    }
  };

  const handleDownloadChemicals = async () => {
    setIsDownloadingChemicals(true);
    try {
      const blob = await cropService.downloadList('chemical');
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "chemicals_list.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download chemicals list.");
    } finally {
      setIsDownloadingChemicals(false);
    }
  };

  const handleDialogChange = (key: string, value: any) => {
    setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleAnswerModeChange = (nextAnswerMode: AnswerMode) => {
    let nextFilters: AdvanceFilterValues;

    if (nextAnswerMode === "search") {
      // Search Results tab → fetch all sources, reset client-side mode
      nextFilters = { ...advanceFilter, source: "all", pae_review: undefined, is_non_agri: undefined, isTrainingQuestion: undefined };
      prevAnswerModeRef.current = "search";
      setAnswerMode("search");
      setAdvanceFilterValues(nextFilters);
      onChange(nextFilters);
      onAnswerModeChange?.("search");
      return;
    }

    // When search is active, switching tabs just filters the already-fetched
    // results client-side — no API call needed.
    if (search) {
      prevAnswerModeRef.current = nextAnswerMode;
      setAnswerMode(nextAnswerMode);
      onAnswerModeChange?.(nextAnswerMode);
      return;
    }

    if (nextAnswerMode === "non_agri") {
      nextFilters = { ...advanceFilter, source: "all", is_non_agri: true, pae_review: undefined, isTrainingQuestion: undefined };
      if (answerMode === "draft" || answerMode === "dynamic") nextFilters.status = "all";
    } else if (nextAnswerMode === "draft") {
      nextFilters = { ...advanceFilter, source: "all", status: "draft", pae_review: undefined, is_non_agri: undefined, isTrainingQuestion: undefined };
    } else if (nextAnswerMode === "dynamic") {
      nextFilters = { ...advanceFilter, source: "all", status: "dynamic", pae_review: undefined, is_non_agri: undefined, isTrainingQuestion: undefined };
    } else if (nextAnswerMode === "pae") {
      nextFilters = { ...advanceFilter, source: "all", pae_review: true, is_non_agri: undefined, isTrainingQuestion: undefined };
      if (answerMode === "draft" || answerMode === "dynamic") nextFilters.status = "all";
    } else if (nextAnswerMode === "training") {
      nextFilters = { ...advanceFilter, source: "all", isTrainingQuestion: true, pae_review: undefined, is_non_agri: undefined, status: "all" };
      if (answerMode === "draft" || answerMode === "dynamic") nextFilters.status = "all";
      if (answerMode === "draft" || answerMode === "dynamic") nextFilters.status = "all";
    } else {
      const source = answerModeToSource(nextAnswerMode);
      nextFilters = { ...advanceFilter, source, pae_review: undefined, is_non_agri: undefined, isTrainingQuestion: undefined };
      if (answerMode === "draft" || answerMode === "dynamic") nextFilters.status = "all";
    }

    prevAnswerModeRef.current = nextAnswerMode;
    setAnswerMode(nextAnswerMode);
    setAdvanceFilterValues(nextFilters);
    onChange(nextFilters);
  };

  useEffect(() => {
    if (!isTrainingUser || answerMode === "training") return;
    handleAnswerModeChange("training");
  }, [answerMode, isTrainingUser]);

  // Auto-switch to Search Results tab when user types; revert when cleared
  useEffect(() => {
    if (search && answerMode !== "search") {
      prevAnswerModeRef.current = answerMode;
      handleAnswerModeChange("search");
    } else if (!search && answerMode === "search") {
      handleAnswerModeChange(prevAnswerModeRef.current);
    }
  }, [search]);

  const clearAddQuestionError = (field: keyof AddQuestionValidationErrors) => {
    setAddQuestionErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _removed, ...rest } = prev;
      return rest;
    });
  };

  useEffect(() => {
    if (!addOpen) {
      setAddQuestionErrors({});
    }
  }, [addOpen]);

  useEffect(() => {
    setAdvanceFilterValues(appliedFilters);
    // Don't override answerMode while search is active — the "search" tab
    // sets source:"all" which filterToAnswerMode resolves to "ajraskha" (fallback),
    // which would reset the active tab back to AJRASAKHA.
    if (!search) {
      setAnswerMode(filterToAnswerMode(appliedFilters));
    }
  }, [appliedFilters]);

  const handleApplyFilters = (myPreference?: IMyPreference) => {
    onChange({
      status: advanceFilter.status,
      source: advanceFilter.source,
      state: myPreference?.state || advanceFilter.state,
      states: advanceFilter.states || [],
      crop: myPreference?.crop || advanceFilter.crop,
      normalised_crop: advanceFilter.normalised_crop,
      normalisedCrops: advanceFilter.normalisedCrops || [],
      answersCount: advanceFilter.answersCount,
      dateRange: advanceFilter.dateRange,
      priority: advanceFilter.priority,
      domain: myPreference?.domain || advanceFilter.domain,
      user: advanceFilter.user,
      endTime: advanceFilter.endTime,
      startTime: advanceFilter.startTime,
      review_level: advanceFilter?.review_level,
      closedAtStart: advanceFilter?.closedAtStart,
      closedAtEnd: advanceFilter?.closedAtEnd,
      closedInTwoHrs: advanceFilter?.closedInTwoHrs,
      consecutiveApprovals: advanceFilter?.consecutiveApprovals,
      autoAllocateFilter: advanceFilter?.autoAllocateFilter,
      autoAllocateModeratorFilter: advanceFilter?.autoAllocateModeratorFilter,
      hiddenQuestions: advanceFilter?.hiddenQuestions,
      duplicateQuestions: advanceFilter?.duplicateQuestions,
      isOnHold: advanceFilter?.isOnHold,
      is_non_agri: advanceFilter?.is_non_agri,
      is_testing: advanceFilter?.is_testing,
      isTrainingQuestion: advanceFilter?.isTrainingQuestion,
      unallocatedQuestions: advanceFilter?.unallocatedQuestions,
    });
  };

  /*const activeFiltersCount = Object.values(advanceFilter).filter(
    (v) =>
      v !== undefined &&
      v !== "all" &&
      !(Array.isArray(v) && v[0] === 0 && v[1] === 100)
  ).length;*/
  const activeFiltersCount =
    Object.entries(advanceFilter).filter(([key, value]) => {
      if (
        key === "startTime" ||
        key === "endTime" ||
        key === "closedAtStart" ||
        key === "closedAtEnd" ||
        key === "state" || // replaced by states
        key === "normalised_crop" || // replaced by normalisedCrops
        key === "is_non_agri" // tab-level filter, not advanced
      ) {
        return false;
      }

      // ignore defaults
      if (value === undefined || value === "all") return false;
      if (key === "closedInTwoHrs" && value === false) return false;
      // array filters: count as active only if non-empty
      if (key === "states" || key === "normalisedCrops") return Array.isArray(value) && value.length > 0;

      if (value === undefined || value === "all" || value === null) return false;
      if (typeof value === "boolean" && value === false) return false;
      if (Array.isArray(value) && value[0] === 0 && value[1] === 100) return false;

      return true;
    }).length +
    // ✅ Created date range counts as ONE
    (advanceFilter.startTime || advanceFilter.endTime ? 1 : 0) +
    // ✅ ClosedAt date range counts as ONE
    (advanceFilter.closedAtStart || advanceFilter.closedAtEnd ? 1 : 0);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Track window size for boundaries
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Optimized Draggable Logic
  const [position, setPosition] = useState({
    x: 10,
    y: typeof window !== "undefined" ? window.innerHeight - 70 : 800,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const offset = useRef({ x: 0, y: 0 });
  const [isBadgeExpanded, setIsBadgeExpanded] = useState(false);
  const hasDragged = useRef(false);
  const { data: statusSummaryRaw, isLoading: isStatusLoading } = useGetQuestionStatusSummary(advanceFilter, search, isBadgeExpanded);
  const statusSummary = statusSummaryRaw as import("@/hooks/api/question/useGetQuestionStatusSummary").QuestionStatusSummary | null;

  // Dynamically clamp the badge position based on its estimated sizes to prevent it from ever clipping off the screen
  const estimatedBadgeHeight = isBadgeExpanded ? 240 : 50;
  const estimatedBadgeWidth = isBadgeExpanded ? 220 : 120;

  const safeX = Math.max(10, Math.min(position.x, windowSize.width - estimatedBadgeWidth - 20));
  const safeY = Math.max(10, Math.min(position.y, windowSize.height - estimatedBadgeHeight - 20));

  const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    open: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
    delayed: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
    "in-review": { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
    closed: { bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-500" },
    dynamic_closed: { bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-500" },
    duplicate_closed: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
    pass: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", dot: "bg-teal-500" },
    hold: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
    duplicate: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", dot: "bg-rose-500" },
    "re-routed": { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", dot: "bg-violet-500" },
    pae_submitted: { bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", dot: "bg-cyan-500" },
    draft: { bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400", dot: "bg-slate-500" },
    dynamic: { bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400", dot: "bg-slate-600" },
    queue_progress: { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", dot: "bg-indigo-500" },
    auditor_review: { bg: "bg-fuchsia-500/10", text: "text-fuchsia-600 dark:text-fuchsia-400", dot: "bg-fuchsia-500" },
    dynamic_closed: { bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-500" },
    duplicate_closed: { bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-500" },
  };
  const defaultColor = { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" };

  const handleMouseDown = (e: any) => {
    setIsDragging(true);
    hasDragged.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    offset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: any) => {
      if (!isDragging) return;
      hasDragged.current = true;

      // Calculate new position based on viewport
      setPosition({
        x: e.clientX - offset.current.x,
        y: e.clientY - offset.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const handleClick = () => {
    navigate({ to: "/flags-reported" });
  }

  return (
    <div className="w-full px-4 pt-3 pb-2 border-b bg-card ms-2 md:ms-0 rounded flex flex-col gap-2.5">
      {/* Add Dialog */}
      <AddOrEditQuestionDialog
        open={addOpen}
        setOpen={setAddOpen}
        setUpdatedData={setUpdatedData}
        updatedData={updatedData}
        onSave={handleAddQuestion}
        userRole={userRole!}
        isLoadingAction={addingQuestion}
        mode="add"
        validationErrors={addQuestionErrors}
        onFieldValidatedChange={clearAddQuestionError}
        defaultIsTrainingQuestion={answerMode === "training"}
      />

      {/* ── ROW 1: Tabs (full width, scrollable on small screens) ── */}
      <AnswerModeSwitcher
        answerMode={answerMode}
        handleAnswerModeChange={(mode) => {
          if (viewMode === "dedicated") setViewMode("all");
          handleAnswerModeChange(mode);
        }}
        currentUserIsTrainingUser={isTrainingUser}
        currentUserIsAdmin={userRole === "admin"}
        hasSearch={!!search}
        sourceCounts={statusSummary?.sourceCounts}
        totalSearchCount={search ? statusSummary?.totalQuestions : undefined}
        showDedicated={
          userRole === "moderator" ||
          userRole === "gate_keeper" ||
          userRole === "auditor"
        }
        isDedicatedView={viewMode === "dedicated"}
        onDedicatedClick={() => setViewMode(viewMode === "dedicated" ? "all" : "dedicated")}
      />

      {/* ── ROW 2: Search + View + Filter + Add ── */}
      <div className="flex items-center gap-2 w-full">
        {/* Search bar — capped width */}
        <div className="w-full max-w-xs sm:max-w-sm min-w-0">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                if (userRole !== "expert") onReset();
                setSearch(e.target.value);
              }}
              className="pl-9 pr-9 bg-background text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Spacer pushes controls to the right */}
        <div className="flex-1" />

        {/* Grid view toggle */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <ViewDropdown view={view} setView={setView} />
        </div>

        {/* Filter */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 dark:bg-[#1a1a1a] dark:border-gray-800 flex-shrink-0"
              >
                <Filter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Tools & Filters</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Add Question */}
        {userRole !== "expert" && userRole !== "tester" && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="flex items-center justify-center px-3 py-1.5 text-sm font-medium flex-shrink-0"
                  onClick={() => {
                    setAddQuestionErrors({});
                    setAddOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add Question</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* ── Bulk-action bar (selection mode only) ── */}
      <div className="w-full flex flex-wrap items-center gap-2 justify-end">

        {isSelectionModeOn && (
          <div className="hidden md:flex items-center gap-4 whitespace-nowrap">
            {/* Allocate to PAE */}
            {userRole !== "expert" && userRole !== "tester" && answerMode.toLowerCase() === "draft" && (
              <Button
                variant="outline"
                size="sm"
                disabled={
                  selectedQuestionIds.length === 0 || isBulkAllocatingPae
                }
                onClick={() => setIsPaeAllocateModalOpen(true)}
                className="flex items-center gap-2 transition-all border-primary text-primary hover:bg-primary/10"
              >
                <UserCheck className="h-4 w-4" />
                {isBulkAllocatingPae
                  ? `Allocating (${selectedQuestionIds.length})...`
                  : `Allocate to PAE (${selectedQuestionIds.length})`}
              </Button>
            )}

            {/* Allocate to EXPERTS */}
            {userRole !== "expert" && userRole !== "tester" && answerMode.toLowerCase() !== "draft" && (
              <div className="relative inline-block">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    selectedQuestionIds.length === 0 ||
                    reAllocating ||
                    isReAllocateDisabled
                  }
                  onClick={() => {
                    setIsReAllocateSelectedQuestionsOpen(true);
                  }}
                  className={`flex items-center gap-2 transition-all border-primary text-primary hover:bg-primary/10 ${reAllocating || isReAllocateDisabled
                    ? "cursor-not-allowed text-green-600"
                    : ""
                    }`}
                >
                  <UserCheck className="h-4 w-4" />
                  {reAllocating
                    ? `Allocating (${selectedQuestionIds.length})...`
                    : isReAllocateDisabled
                      ? `Will be available in 50s`
                      : `ReAllocate Experts (${selectedQuestionIds.length})`}
                </Button>

                <Badge
                  variant="default"
                  className="absolute -top-2 -right-2 h-4 text-[9px] px-1.5 py-0 bg-red-500 text-white hover:bg-red-600 border-0 font-medium shadow-sm"
                >
                  New
                </Badge>
              </div>
            )}

            {/* Bulk delete with count */}
            {userRole !== "tester" && (
              <ConfirmationModal
                title="Delete Selected Questions?"
                description={`Are you sure you want to delete ${selectedQuestionIds.length
                  } selected question${selectedQuestionIds.length > 1 ? "s" : ""
                  }? This action is irreversible.`}
                confirmText="Delete"
                cancelText="Cancel"
                isLoading={bulkDeletingQuestions}
                type="delete"
                onConfirm={handleBulkDelete}
                trigger={
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={
                      selectedQuestionIds.length === 0 || bulkDeletingQuestions
                    }
                    className="flex items-center gap-2 transition-all"
                  >
                    <Trash className="h-4 w-4" />
                    {bulkDeletingQuestions
                      ? `Deleting (${selectedQuestionIds.length})...`
                      : `Delete (${selectedQuestionIds.length})`}
                  </Button>
                }
              />
            )}

            {/* Cancel selection */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsSelectionModeOn(false);
                setSelectedQuestionIds([]);
              }}
              className="flex items-center gap-2 transition-all"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* <span className="hidden md:block text-sm text-muted-foreground whitespace-nowrap">
          Total: {totalQuestions}
        </span> */}
      </div>
      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Side Action Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[380px] bg-white dark:bg-[#141414] border-l border-gray-200 dark:border-gray-800 z-[60] shadow-2xl dark:shadow-[0_0_50px_rgba(0,0,0,0.5)] transform transition-transform duration-300 ease-out ${isSidebarOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a1a]">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Management Tools
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Configure view and bulk actions
            </p>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-gray-200 dark:hover:bg-white/5 rounded-full transition-colors text-gray-500 dark:text-gray-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto h-[calc(100%-80px)] sidebar-scroll-hidden">
          {/* Section: View Mode */}
          <section>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">
              Display Settings
            </h3>
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-[#0d0d0d] rounded-lg border border-gray-200 dark:border-gray-800">
              <button
                className={`py-2.5 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-all ${viewMode === "all" || viewMode === "dedicated" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-white"}`}
                onClick={() => setViewMode("all")}
              >
                <LayoutGrid size={14} /> Normal
              </button>
              <button
                className={`py-2.5 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-all ${viewMode === "review-level" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-white"}`}
                onClick={() => setViewMode("review-level")}
              >
                <Clock size={14} /> Turn Around
              </button>
            </div>
          </section>
          <section className="hidden md:block">
            <h3 className=" relative text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">
              Hide Columns
            </h3>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-lg">
              {activeColumns
                .filter((key) => {
                  if (key === "created" && showClosedAt) return false;
                  if (key === "closed" && !showClosedAt) return false;
                  return true;
                })
                .map((key) => {
                  const isVisible = visibleColumns[key];
                  return (
                    <button
                      key={key}
                      onClick={() => toggleColumn(key)}
                      className={`flex items-center justify-between px-5 py-2 rounded-lg border transition-all duration-300 hover:border-emerald-500/60
              ${isVisible
                          ? "bg-emerald-500/5 border-emerald-500/30 dark:text-white text-gray-600"
                          : "bg-transparent border-slate-200 dark:border-white/5 text-slate-400 dark:text-gray-600"
                        }
            `}
                    >
                      <span className="text-xs font-semibold tracking-wider capitalize">
                        {key.replace(/_/g, " ")}
                      </span>

                      {isVisible ? (
                        <Eye size={16} className="text-emerald-400" />
                      ) : (
                        <EyeOff size={16} className="text-emerald-400/40" />
                      )}
                    </button>
                  );
                })}
            </div>
          </section>

          {/* Section: Critical Actions */}
          <section>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">
              Management Actions
            </h3>
            <div className="space-y-3">
              {/* total turn around time sort */}
              {viewMode === "review-level" && (
                <div className="relative">
                  <button
                    onClick={() => {
                      onSort("totalTurnAround");
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-500/5 hover:border-indigo-500/40 rounded-xl group transition-all shadow-sm dark:shadow-none"
                  >
                    {/* Left Section */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <ArrowUpDown size={18} />
                      </div>

                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <p className="relative text-sm font-semibold text-gray-900 dark:text-white">
                            Turnaround Time
                          </p>
                        </div>

                        <p className="text-xs text-gray-500">
                          Sort by total response duration
                        </p>
                      </div>
                    </div>

                    {/* Right Section */}
                    <div className="flex items-center gap-2">
                      {sort === "totalTurnAround___asc" && (
                        <ArrowUpNarrowWide
                          size={22}
                          className="text-green-500"
                        />
                      )}

                      {sort === "totalTurnAround___desc" && (
                        <ArrowDownNarrowWide
                          size={22}
                          className="text-green-500"
                        />
                      )}
                    </div>
                  </button>
                </div>
              )}

              {/* WhatsApp History */}
              {userRole !== "expert" && userRole !== 'tester' && !isTrainingUser && (
                <button
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-green-50 dark:hover:bg-green-500/5 border border-gray-200 dark:border-gray-800 hover:border-green-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none relative"
                  onClick={() => {
                    navigate({ to: "/whatsapp-history" });
                    setIsSidebarOpen(false);
                  }}
                >
                  <TopRightBadge label="new" left={0} />
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-500/10 flex items-center justify-center text-green-600 dark:text-green-500">
                      <MessageSquare size={20} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="relative text-sm font-bold text-gray-900 dark:text-white">
                          WhatsApp History
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        View conversation logs
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* update crops */}
              {userRole !== "expert" && userRole !== "tester" && (
                <button
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-amber-50 dark:hover:bg-amber-500/5 border border-gray-200 dark:border-gray-800 hover:border-amber-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none"
                  onClick={() => {
                    setIsCropModalOpen(true);
                    setIsSidebarOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500">
                      <Cpu size={20} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="relative text-sm font-bold text-gray-900 dark:text-white">
                          AgriTech Management
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Manage AgriTech List
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* update chemicals — commented out */}
              {/* {userRole !== "expert" && (
                <button
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-purple-50 dark:hover:bg-purple-500/5 border border-gray-200 dark:border-gray-800 hover:border-purple-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none"
                  onClick={() => {
                    setIsChemicalModalOpen(true);
                    setIsSidebarOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-500">
                      <Beaker size={20} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="relative text-sm font-bold text-gray-900 dark:text-white">
                          Update Chemicals
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Manage chemical master list
                      </p>
                    </div>
                  </div>
                </button>
              )} */}

              {/* reallocate */}
              {userRole !== "expert" && userRole !== "tester" && !isTrainingUser && (
                <button
                  className="relative w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-green-50 dark:hover:bg-green-500/5 border border-gray-200 dark:border-gray-800 hover:border-green-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none"
                  onClick={() => {
                    setIsReAllocateOpen(true);
                    setIsSidebarOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-500/10 flex items-center justify-center text-green-600 dark:text-green-500">
                      <RotateCcw size={20} />
                    </div>

                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          ReAllocate Questions
                        </p>
                      </div>

                      <p className="text-[11px] text-gray-500">
                        Assign to different experts
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant="default"
                    className="absolute -top-2 -right-2 h-4 text-[9px] px-1.5 py-0 bg-red-500 text-white hover:bg-red-600 border-0 font-medium shadow-sm"
                  >
                    New
                  </Badge>
                </button>
              )}

              {/* send outreach rport */}
              {userRole !== "expert" && userRole !== "tester" && !isTrainingUser && (
                <OutreachReportModal setIsSidebarOpen={setIsSidebarOpen} />
              )}
              {/* preferences */}
              <AdvanceFilterDialog
                advanceFilter={advanceFilter}
                setAdvanceFilterValues={setAdvanceFilterValues}
                handleDialogChange={handleDialogChange}
                handleApplyFilters={handleApplyFilters}
                crops={crops}
                activeFiltersCount={activeFiltersCount}
                onReset={onReset}
                isForQA={false}
                setIsSidebarOpen={setIsSidebarOpen}
              />

              {/* queue details — admins, moderators, gate keepers & auditors */}
              {canViewQueueDetails(userRole) && !isTrainingUser && (
                <QueueDetailsModal setIsSidebarOpen={setIsSidebarOpen} />
              )}

              {/* gate keeper / auditor queue — admins, moderators, gate keepers & auditors */}
              {canViewQueueDetails(userRole) && !isTrainingUser && (
                <GateKeeperAuditorQueueModal setIsSidebarOpen={setIsSidebarOpen} />
              )}
            </div>
          </section>

          {/* Section: Download Reports */}
          {userRole !== "expert" && userRole !== 'tester' && (
            <section>
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">
                Download Reports
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Export question reports with custom date ranges and filters for
                analysis and record-keeping.
              </p>
              <div className="space-y-3">
                <div className="p-4 bg-white dark:bg-[#1a1a1a] hover:bg-blue-50 dark:hover:bg-blue-500/5 border border-gray-200 dark:border-gray-800 hover:border-blue-500/50 rounded-xl transition-all shadow-sm dark:shadow-none">
                  <DownloadReportButton
                    onOpenDialog={() => setIsSidebarOpen(false)}
                  />
                </div>

                <div className="p-4 bg-white dark:bg-[#1a1a1a] hover:bg-purple-50 dark:hover:bg-purple-500/5 border border-gray-200 dark:border-gray-800 hover:border-purple-500/50 rounded-xl transition-all shadow-sm dark:shadow-none">
                  <DownloadOverallReportButton
                    onOpenDialog={() => setIsSidebarOpen(false)}
                  />
                </div>
                {userRole !== "moderator" && (
                  <div className="p-4 bg-white dark:bg-[#1a1a1a] hover:bg-green-50 dark:hover:bg-green-500/5 border border-gray-200 dark:border-gray-800 hover:border-green-500/50 rounded-xl transition-all shadow-sm dark:shadow-none">
                    <DownloadFilteredReportButton
                      onOpenDialog={() => setIsSidebarOpen(false)}
                    />
                  </div>
                )}

                <div className="p-4 bg-white dark:bg-[#1a1a1a] hover:bg-teal-50 dark:hover:bg-teal-500/5 border border-gray-200 dark:border-gray-800 hover:border-teal-500/50 rounded-xl transition-all shadow-sm dark:shadow-none">
                  <DownloadDuplicateReportButton
                    onOpenDialog={() => setIsSidebarOpen(false)}
                  />
                </div>

                <div className="p-4 bg-white dark:bg-[#1a1a1a] hover:bg-amber-50 dark:hover:bg-amber-500/5 border border-gray-200 dark:border-gray-800 hover:border-amber-500/50 rounded-xl transition-all shadow-sm dark:shadow-none">
                  <DownloadLevelWiseReportButton
                    closeSideBar={() => setIsSidebarOpen(false)}
                  />
                </div>

                <div className="p-4 bg-white dark:bg-[#1a1a1a] hover:bg-cyan-50 dark:hover:bg-cyan-500/5 border border-gray-200 dark:border-gray-800 hover:border-b-cyan-500/50 rounded-xl transition-all shadow-sm dark:shadow-none">
                  <DownloadShiftWiseReportButton
                    closeSideBar={() => setIsSidebarOpen(false)}
                    userRole={userRole}
                  />
                </div>

                {/* Download Master Lists — Crops & Chemicals */}
                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadCrops}
                    disabled={isDownloadingCrops}
                    className="relative flex-1 flex items-center justify-center gap-2 p-3 bg-white dark:bg-[#1a1a1a] hover:bg-amber-50 dark:hover:bg-amber-500/5 border border-gray-200 dark:border-gray-800 hover:border-amber-500/50 rounded-xl transition-all shadow-sm dark:shadow-none text-amber-600 dark:text-amber-500 disabled:opacity-50 text-xs font-medium"
                  >
                    {isDownloadingCrops ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    Crops List
                    <TopRightBadge label="new" left={0} />
                  </button>
                  <button
                    onClick={handleDownloadChemicals}
                    disabled={isDownloadingChemicals}
                    className="relative flex-1 flex items-center justify-center gap-2 p-3 bg-white dark:bg-[#1a1a1a] hover:bg-purple-50 dark:hover:bg-purple-500/5 border border-gray-200 dark:border-gray-800 hover:border-purple-500/50 rounded-xl transition-all shadow-sm dark:shadow-none text-purple-600 dark:text-purple-500 disabled:opacity-50 text-xs font-medium"
                  >
                    {isDownloadingChemicals ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    Chemicals List
                    <TopRightBadge label="new" left={0} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Section: Global Controls */}
          <section>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">
              System
            </h3>

            {userRole !== "expert" && (
              <button
                onClick={handleClick}
                className="relative w-full flex items-center justify-between p-4 mb-3 bg-white dark:bg-[#1a1a1a] hover:bg-amber-50 dark:hover:bg-amber-500/5 border border-gray-200 dark:border-gray-800 hover:border-amber-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none"
              >
                <TopRightBadge label="new" left={0} />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-500">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="relative text-sm font-bold text-gray-900 dark:text-white">
                        Flags Reported
                      </p>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      View flags reported
                    </p>
                  </div>
                </div>
              </button>
            )}

            <div className="flex gap-3 pb-5">
              <button
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg text-sm hover:border-gray-400 dark:hover:border-gray-600 transition-colors text-gray-700 dark:text-gray-300 shadow-sm dark:shadow-none"
                onClick={() => {
                  refetch();
                  onSort("clearSort");
                  setIsSidebarOpen(false);
                }}
              >
                <RefreshCcw size={14} /> Refresh Data
              </button>
            </div>
          </section>
        </div>
      </div>
      {/* Draggable Stats Badge */}
      <div
        ref={dragRef}
        onMouseDown={handleMouseDown}
        onClick={() => {
          if (!hasDragged.current) {
            setIsBadgeExpanded((prev) => !prev);
          }
        }}
        className={`fixed z-50 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-600 shadow-xl backdrop-blur-md select-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isBadgeExpanded
          ? "rounded-[16px] px-4 py-3 min-w-[220px]"
          : "rounded-[24px] px-4 py-2.5 min-w-[120px]"
          } ${isDragging ? "cursor-grabbing shadow-2xl scale-105" : "cursor-grab hover:shadow-2xl"}`}
        style={{
          left: `${safeX}px`,
          top: `${safeY}px`,
          touchAction: "none",
        }}
      >
        {/* Header row */}
        <div className="flex items-center gap-3">
          <Activity
            size={14}
            className="text-green-600 dark:text-green-500 shrink-0"
          />
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest whitespace-nowrap">
            <TopRightBadge label="new" right={0} />
            Total:{" "}
            <span className="text-gray-900 dark:text-white transition-opacity duration-300">
              {statusSummary?.totalQuestions ?? totalQuestions}
            </span>
          </span>
          <span
            className={`ml-auto text-gray-400 dark:text-gray-500 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isBadgeExpanded ? "rotate-180" : "rotate-0"
              }`}
          >
            <ChevronDown size={14} />
          </span>
        </div>

        {/* Expanded status breakdown */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isBadgeExpanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
            }`}
        >
          <div className="overflow-hidden">
            <div className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-gray-700 pt-3">
              {isStatusLoading ? (
                <div className="flex items-center justify-center py-2 h-[120px]">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                  <span className="ml-2 text-xs text-gray-400">Loading...</span>
                </div>
              ) : (
                statusSummary?.statuses?.map((s) => {
                  const color = STATUS_COLORS[s.status] || defaultColor;
                  return (
                    <div
                      key={s.status}
                      onClick={() => {
                        // If clicking the same status, revert to previous filter
                        if (
                          advanceFilter.status === s.status &&
                          previousFilter
                        ) {
                          setAdvanceFilterValues(previousFilter);
                          onChange(previousFilter);
                          setPreviousFilter(null);
                        } else {
                          // Save current filter and apply new status filter
                          setPreviousFilter(advanceFilter);
                          const nextFilters = {
                            ...advanceFilter,
                            status: s.status as any,
                          };
                          setAdvanceFilterValues(nextFilters);
                          onChange(nextFilters);
                        }
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${color.bg} transition-colors cursor-pointer hover:opacity-80`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${color.dot} shrink-0`}
                        />
                        <span
                          className={`text-xs font-semibold capitalize ${color.text} whitespace-nowrap`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold tabular-nums ${color.text}`}
                      >
                        {s.count}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Old automated reallocation logic - commented out as per user request */}
      {/* 
      <ConfirmationModal
        title="ReAllocate work load?"
        description="Are you sure you want to ReAllocate work load?"
        confirmText="ReAllocate"
        cancelText="Cancel"
        secondaryConfirmText="Inactive to Active"
        isLoading={reAllocateQuestion && !isReAllocateDisabled}
        secondaryIsLoading={reAllocateQuestion && isReAllocateDisabled}
        type="default"
        open={isReAllocateOpen}
        onOpenChange={setIsReAllocateOpen}
        onConfirm={() => handleReAllocateLessWorkload()}
        onSecondaryConfirm={() => handleReAllocateLessWorkload("inactive")}
        confirmTooltip="Reallocate delayed questions (exceeding 2 hours)"
        secondaryConfirmTooltip="Reallocate questions from inactive or blocked experts to active experts"
      />
      */}
      <ConfirmationModal
        title="ReAllocate work load?"
        description="Choose the type of reallocation you want to perform. You will be able to manually map questions to active experts in the next step."
        confirmText="Default Escalation"
        cancelText="Cancel"
        secondaryConfirmText="Inactive to Active"
        isLoading={false}
        type="default"
        open={isReAllocateOpen}
        onOpenChange={setIsReAllocateOpen}
        onConfirm={() => {
          setPendingReallocateType("escalation");
          setIsReAllocateOpen(false);
        }}
        onSecondaryConfirm={() => {
          setPendingReallocateType("inactive");
          setIsReAllocateOpen(false);
        }}
        confirmTooltip="Manually reallocate delayed questions (exceeding 2 hours)"
        secondaryConfirmTooltip="Manually reallocate questions from inactive or blocked experts"
      />
      <ReallocationManualModal
        open={isManualReallocateOpen}
        onOpenChange={setIsManualReallocateOpen}
        type={manualReallocateType}
      />

      {/* confirmation modal for reallocate selected questions to experts */}
      <ConfirmationModal
        title="ReAllocate selected questions?"
        description="Are you sure you want to ReAllocate selected questions?"
        confirmText="ReAllocate"
        cancelText="Cancel"
        isLoading={reAllocating}
        type="default"
        open={isReAllocateSelectedQuestionsOpen}
        onOpenChange={setIsReAllocateSelectedQuestionsOpen}
        onConfirm={handleReAllocateSelectedQuestions}
      />
      <CropManagementModal
        open={isCropModalOpen}
        onOpenChange={setIsCropModalOpen}
      />
      <ChemicalManagementModal
        open={isChemicalModalOpen}
        onOpenChange={setIsChemicalModalOpen}
      />
      <BulkUploadAllocationModal
        open={isPaeAllocateModalOpen}
        onClose={() => setIsPaeAllocateModalOpen(false)}
        isLoading={isBulkAllocatingPae}
        paeOnly
        onConfirm={async (_mode, paeExpertId) => {
          if (!paeExpertId) return;
          await handleBulkAllocateToPae(paeExpertId);
          setIsPaeAllocateModalOpen(false);
        }}
      />
    </div>
  );
};
