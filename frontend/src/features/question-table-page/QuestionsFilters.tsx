import { useEffect, useRef, useState } from "react";

import { Button } from "../../components/atoms/button";
import { Input } from "../../components/atoms/input";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Clock,
  Plus,
  RotateCcw,
  Search,
  Trash,
  X,
  Filter,
  RefreshCw,
  LayoutGrid,
  Activity,
  ArrowUpDown,
  EyeOff,
  Eye,
} from "lucide-react";
import {
  AdvanceFilterDialog,
  type AdvanceFilterValues,
} from "../../components/advanced-question-filter";
import type {
  IDetailedQuestion,
  IMyPreference,
  QuestionSource,
  QuestionStatus,
  UserRole,
} from "@/types";
import { toast } from "sonner";
import { ConfirmationModal } from "../../components/confirmation-modal";
import { OutreachReportModal } from "@/features/question_details/components/OutreachReport";
import { useAddQuestion } from "@/hooks/api/question/useAddQuestion";

import { AddOrEditQuestionDialog } from "./AddOrEditQuestionDialog";
import { useReAllocateLessWorkload } from "@/hooks/api/question/useReAllocateLessWorkload";
import {
  allModeColumns,
  commonColumns,
  reviewModeColumns,
  useQuestionTableStore,
} from "@/stores/all-questions";
import ViewDropdown from "../questions/components/ViewDropdown";

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
  userRole: UserRole;
  isSelectionModeOn: boolean;
  bulkDeletingQuestions: boolean;
  handleBulkDelete: () => void;
  selectedQuestionIds: string[];
  setIsSelectionModeOn: (value: boolean) => void;
  setSelectedQuestionIds: (value: string[]) => void;
  viewMode: "all" | "review-level";
  setViewMode: (v: "all" | "review-level") => void;
  sort: string;
  onSort: (key: string) => void;
  showClosedAt?: boolean;
  view: "grid" | "table";
  setView: (v: "grid" | "table") => void;
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
}: QuestionsFiltersProps) => {
  //question global state
  const { visibleColumns, toggleColumn } = useQuestionTableStore();
  const activeColumns = [
    ...commonColumns,
    ...(viewMode === "all" ? allModeColumns : reviewModeColumns),
  ];
  const [advanceFilter, setAdvanceFilterValues] =
    useState<AdvanceFilterValues>(appliedFilters);
  const [addOpen, setAddOpen] = useState(false);
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
    null,
  );

  const { mutateAsync: addQuestion, isPending: addingQuestion } =
    useAddQuestion((count, isBulkUpload) => {
      setUploadedQuestionsCount(count);
      setIsBulkUpload(isBulkUpload);
    });
  const { mutateAsync: reAllocateLessWorkload, isPending: reAllocateQuestion } =
    useReAllocateLessWorkload();
  const [isReAllocateOpen,setIsReAllocateOpen] = useState(false);
  const [isReAllocateDisabled, setIsReAllocateDisabled] = useState(false);
  const handleReAllocateLessWorkload = async () => {
    try {
      setIsReAllocateDisabled(true);
      const res = await reAllocateLessWorkload();

      if (!res) {
        toast.error("No response from server");
        setIsReAllocateDisabled(false);
        return;
      }
      if (res.message === "Workload balancing started in background") {
        toast.success(
          "Workload balancing has started in the background. Please wait 50 seconds before reallocating again.",
        );
        // Re-enable button after 30 seconds
        setTimeout(() => {
          setIsReAllocateDisabled(false);
        }, 50000);
      } else if (res.message) {
        // Any other message from backend
        toast.success(res.message);
        setIsReAllocateDisabled(false);
      }
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

  const handleAddQuestion = async (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus,
    formData?: FormData,
  ) => {
    try {
      if (mode !== "add") return;
      if (formData) {
        await addQuestion(formData as any);
        // toast.success('File Uploaded succesfully')
        setAddOpen(false);
        return;
      }
      if (!updatedData) {
        toast.error("No data found to add. Please try again!");
        return;
      }

      const payload = {
        question: updatedData.question?.trim() ?? "",
        priority: updatedData.priority ?? "medium",
        source: "AGRI_EXPERT" as QuestionSource,
        details: updatedData.details,
        context: updatedData.context || "",
      };

      if (!payload.question) {
        toast.error("Please enter a question before submitting.");
        return;
      }
      if (payload.question.length < 10) {
        toast.error("Question must be at least 10 characters long.");
        return;
      }

      if (!payload.priority) {
        toast.error("Please select a priority (Low, Medium, or High).");
        return;
      }
      if (!["low", "medium", "high"].includes(payload.priority)) {
        toast.error(
          "Invalid priority value. Please reselect from the options.",
        );
        return;
      }

      if (!payload.source) {
        toast.error("Please select a source (AJRASAKHA or AGRI_EXPERT).");
        return;
      }
      if (!["AJRASAKHA", "AGRI_EXPERT"].includes(payload.source)) {
        toast.error(
          "Invalid source selected. Please reselect from the options.",
        );
        return;
      }

      if (!payload.details) {
        toast.error("Please fill in the question details.");
        return;
      }

      const { state, district, crop, season, domain } = payload.details;

      if (!state?.trim()) {
        toast.error("Please Select the State field.");
        return;
      }

      if (!district?.trim()) {
        toast.error("Please enter the District field.");
        return;
      }

      if (!crop?.trim()) {
        toast.error("Please Select the Crop field.");
        return;
      }

      if (!season?.trim()) {
        toast.error("Please Select the Season field.");
        return;
      }

      if (!domain?.trim()) {
        toast.error("Please Select the Domain field.");
        return;
      }

      await addQuestion(payload);
      // toast.success("Question added successfully.");
      setAddOpen(false);
    } catch (error) {
      console.error("Error in handleAddQuestion:", error);
      // toast.error("An unexpected error occurred. Please try again.");
      setAddOpen(false);
    }
  };

  const handleDialogChange = (key: string, value: any) => {
    setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = (myPreference?: IMyPreference) => {
    onChange({
      status: advanceFilter.status,
      source: advanceFilter.source,
      state: myPreference?.state || advanceFilter.state,
      crop: myPreference?.crop || advanceFilter.crop,
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
      consecutiveApprovals: advanceFilter?.consecutiveApprovals,
      autoAllocateFilter: advanceFilter?.autoAllocateFilter,
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
      // ❌ exclude date range internal fields
      if (
        key === "startTime" ||
        key === "endTime" ||
        key === "closedAtStart" ||
        key === "closedAtEnd"
      ) {
        return false;
      }

      // ignore defaults
      if (value === undefined || value === "all") return false;

      //  ignore default slider range
      if (Array.isArray(value) && value[0] === 0 && value[1] === 100) {
        return false;
      }

      return true;
    }).length +
    // ✅ Created date range counts as ONE
    (advanceFilter.startTime || advanceFilter.endTime ? 1 : 0) +
    // ✅ ClosedAt date range counts as ONE
    (advanceFilter.closedAtStart || advanceFilter.closedAtEnd ? 1 : 0);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Optimized Draggable Logic
  const [position, setPosition] = useState({
    x: 10,
    y: window.innerHeight - 70,
  }); // Initial screen position
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const offset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: any) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    offset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: any) => {
      if (!isDragging) return;

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

  return (
    <div className="w-full p-4 border-b bg-card ms-2 md:ms-0  rounded flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
      />

      {/* SEARCH BAR – full width on mobile, fixed width on desktop */}
      <div className="w-full sm:flex-1 sm:min-w-[250px] sm:max-w-[400px]">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

          <Input
            placeholder="Search questions by id, state, crops..."
            value={search}
            onChange={(e) => {
              if (userRole !== "expert") onReset();
              setSearch(e.target.value);
            }}
            className="pl-9 pr-9 bg-background"
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

      <div className="w-full sm:w-auto flex flex-wrap items-center gap-2 sm:gap-3 justify-between sm:justify-end">
        <div className="relative hidden md:flex items-center gap-2">
          <ViewDropdown view={view} setView={setView} />
          <span className="absolute -top-2 -right-2 bg-red-500 text-[8px] text-white px-1 rounded uppercase font-bold">
            New
          </span>
        </div>

        {/* tools and filters */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-2 px-3 sm:px-4 py-2 sm:py-1.5 cursor-pointer bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-md hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-sm dark:shadow-none text-xs sm:text-sm"
        >
          <Filter className="h-4 w-4 flex-shrink-0" />
          <span className="sm:inline font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
            Tools & Filters
          </span>
        </button>

        {userRole !== "expert" && (
          <Button
            variant="default"
            size="sm"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 text-xs sm:text-sm py-2 sm:py-1.5 whitespace-nowrap"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 flex-shrink-0" />
            <span className="xs:inline">New Question</span>
          </Button>
        )}

        {isSelectionModeOn && (
          <div className="hidden md:flex items-center gap-4 whitespace-nowrap">
            {/* Bulk delete with count */}
            <ConfirmationModal
              title="Delete Selected Questions?"
              description={`Are you sure you want to delete ${
                selectedQuestionIds.length
              } selected question${
                selectedQuestionIds.length > 1 ? "s" : ""
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
                className={`py-2.5 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition-all ${viewMode === "all" ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-white"}`}
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
          {view === "table" && (
            <section className="hidden md:block">
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">
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
              ${
                isVisible
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
          )}

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
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            Turnaround Time
                          </p>
                          <span className="bg-red-500 text-[8px] text-white px-1 rounded uppercase font-bold">
                            New
                          </span>
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

              {/* reallocate */}
              {userRole !== "expert" && (
                <button
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-green-50 dark:hover:bg-green-500/5 border border-gray-200 dark:border-gray-800 hover:border-green-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none"
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
                        <span className="bg-red-500 text-[8px] text-white px-1 rounded uppercase font-bold">
                          New
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Assign to different experts
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {/* send outreach rport */}
              {userRole !== "expert" && (
                <OutreachReportModal setIsSidebarOpen={setIsSidebarOpen} />
              )}
              {/* preferences */}
              <AdvanceFilterDialog
                advanceFilter={advanceFilter}
                setAdvanceFilterValues={setAdvanceFilterValues}
                handleDialogChange={handleDialogChange}
                handleApplyFilters={handleApplyFilters}
                normalizedStates={states}
                crops={crops}
                activeFiltersCount={activeFiltersCount}
                onReset={onReset}
                isForQA={false}
                setIsSidebarOpen={setIsSidebarOpen}
              />
            </div>
          </section>

          {/* Section: Global Controls */}
          <section>
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">
              System
            </h3>
            <div className="flex gap-3 pb-5">
              <button
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg text-sm hover:border-gray-400 dark:hover:border-gray-600 transition-colors text-gray-700 dark:text-gray-300 shadow-sm dark:shadow-none"
                onClick={() => {
                  refetch();
                  onSort("clearSort");
                  setIsSidebarOpen(false);
                }}
              >
                <RefreshCw size={14} /> Refresh Data
              </button>
            </div>
          </section>
        </div>
      </div>
      {/* Draggable Stats Badge */}
      <div
        ref={dragRef}
        onMouseDown={handleMouseDown}
        className={`fixed z-50 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-600 px-4 py-2 rounded-full flex items-center gap-3 shadow-xl backdrop-blur-md select-none transition-shadow ${isDragging ? "cursor-grabbing shadow-2xl scale-105" : "cursor-grab hover:shadow-2xl"}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          touchAction: "none",
        }}
      >
        <Activity size={14} className="text-green-600 dark:text-green-500" />
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
          Total:{" "}
          <span className="text-gray-900 dark:text-white">
            {totalQuestions}
          </span>
        </span>
      </div>
      <ConfirmationModal
                title="ReAllocate work load?"
                description="Are you sure you want to ReAllocate work load?"
                confirmText="ReAllocate"
                cancelText="Cancel"
                isLoading={reAllocateQuestion}
                type="default"
                open={isReAllocateOpen}
                onOpenChange={setIsReAllocateOpen}
                onConfirm={handleReAllocateLessWorkload}
              />
    </div>
  );
};