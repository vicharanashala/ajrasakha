import {
  useState,
} from "react";

import { Button } from "../../components/atoms/button";
import { Input } from "../../components/atoms/input";
import {
  Plus,
 RefreshCcw,
 Search,
  Trash,
  X,Info
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
import { useAddQuestion } from "@/hooks/api/question/useAddQuestion";

import { TopRightBadge } from "../../components/NewBadge";
import { AddOrEditQuestionDialog } from "./AddOrEditQuestionDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/atoms/tooltip";
import {useReAllocateLessWorkload} from '@/hooks/api/question/useReAllocateLessWorkload'

type QuestionsFiltersProps = {
  search: string;
  states: string[];
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
};

export const QuestionsFilters = ({
  search,
  setSearch,
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
}: QuestionsFiltersProps) => {
  const [advanceFilter, setAdvanceFilterValues] = useState<AdvanceFilterValues>(
    {
      status: "all",
      source: "all",
      state: "all",
      answersCount: [0, 100],
      dateRange: "all",
      crop: "all",
      priority: "all",
      domain: "all",
      user: "all",
      endTime: undefined,
      startTime: undefined,
      review_level: "all",
      closedAtStart: undefined,
      closedAtEnd: undefined,
      consecutiveApprovals:'all'
    }
  );
  const [addOpen, setAddOpen] = useState(false);
  const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
    null
  );

  const { mutateAsync: addQuestion, isPending: addingQuestion } =
    useAddQuestion((count, isBulkUpload) => {
      setUploadedQuestionsCount(count);
      setIsBulkUpload(isBulkUpload);
    });
    const { mutateAsync: reAllocateLessWorkload, isPending: reAllocateQuestion } =
    useReAllocateLessWorkload();
    const handleReAllocateLessWorkload = async () => {
       try {
       
        const res = await reAllocateLessWorkload();

    if (!res) {
      toast.error("No response from server");
      return;
    }

    toast.success(res.message);
    
      } catch (error) {
        toast.error("Failed to reAllocate question for those who has less workload");
        console.error("Error reAllocating question who has less workload question:", error);
      }
    };

  const handleAddQuestion = async (
    mode: "add" | "edit",
    entityId?: string,
    flagReason?: string,
    status?: QuestionStatus,
    formData?: FormData
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
          "Invalid priority value. Please reselect from the options."
        );
        return;
      }

      if (!payload.source) {
        toast.error("Please select a source (AJRASAKHA or AGRI_EXPERT).");
        return;
      }
      if (!["AJRASAKHA", "AGRI_EXPERT"].includes(payload.source)) {
        toast.error(
          "Invalid source selected. Please reselect from the options."
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
      consecutiveApprovals:advanceFilter?.consecutiveApprovals
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

  return (
    <div className="w-full p-4 border-b bg-card ms-2 md:ms-0  rounded flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {/* Add Dialog (No change) */}
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
      <div className="relative inline-block">
      {userRole !== "expert" && (
        <Tooltip>
        <TooltipTrigger asChild>
        <Button
            variant="default"
            size="sm"
            className="flex items-center gap-2 w-full md:w-fit"
            onClick={() => handleReAllocateLessWorkload ()}
            disabled={reAllocateQuestion}
          >
             <Info className="h-4 w-4" /> ReAllocate
            
          </Button>
          
          
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-sm">
          <p>
            {`This option allows reallocating questions  that have been
            delayed by atleast 1 hour for those who has less workload( <= 5)`} .
          </p>
        </TooltipContent>
      </Tooltip>
         
        )}
        <TopRightBadge label="New" />
      </div>

      <div className="w-full sm:w-auto flex flex-wrap items-center gap-3 justify-between sm:justify-end">
        <div className="relative inline-block">
          <TopRightBadge label="New" />
          <div className="flex gap-2 border rounded-md p-1 bg-muted/40">
            <button
              className={`px-3 py-1 rounded-md text-sm ${
                viewMode === "all"
                  ? "bg-primary text-white"
                  : "text-muted-foreground"
              }`}
              onClick={() => setViewMode("all")}
            >
              Normal
            </button>

            <button
              className={`px-3 py-1 rounded-md text-sm ${
                viewMode === "review-level"
                  ? "bg-primary text-white"
                  : "text-muted-foreground"
              }`}
              onClick={() => setViewMode("review-level")}
            >
              Turn Around
            </button>
          </div>
        </div>

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
        />

        <Button
          variant="outline"
          size="icon"
          className="w-10 h-10 sm:w-12 sm:h-10 flex-none hidden md:flex"
          onClick={refetch}
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>

        {userRole !== "expert" && (
          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-2 w-full md:w-fit"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Question
          </Button>
        )}

        {
          isSelectionModeOn && (
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
          )
          // ) : (
          //   <span className="hidden md:block text-sm text-muted-foreground whitespace-nowrap">
          //     Total: {totalQuestions}
          //   </span>
          // )
        }
        <span className="hidden md:block text-sm text-muted-foreground whitespace-nowrap">
          Total: {totalQuestions}
        </span>
      </div>
    </div>
  );
};