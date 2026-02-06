import { useGetAllDetailedQuestions } from "@/hooks/api/question/useGetAllDetailedQuestions";
//import { QuestionsFilters, QuestionsTable } from "./questions-table";
import { QuestionsTable } from "../features/question-table-page/questions-table";
import { QuestionsFilters } from "../features/question-table-page/QuestionsFilters";
import { useEffect, useMemo, useState } from "react";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { QuestionDetails } from "./question-details";
import type { IUser } from "@/types";
import {
  CROPS,
  STATES,
  type QuestionDateRangeFilter,
  type QuestionFilterStatus,
  type QuestionPriorityFilter,
  type QuestionSourceFilter,
  type ReviewLevel,
} from "./advanced-question-filter";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { useBulkDeleteQuestions } from "@/hooks/api/question/useBulkDeleteQuestions";
import { toast } from "sonner";
import Spinner from "./atoms/spinner";
import { ReviewLevelsTable } from "@/features/questions/components/review-level/ReviewLevelsTable";
import { useGetQuestionsAndLevel } from "@/features/questions/hooks/useGetQuestionsAndLevel";
import { mapReviewQuestionToRow } from "@/features/questions/utils/mapReviewLevel";
import { Button } from "@/components/atoms/button";        // ← ADD THIS
import { Mail } from "lucide-react"; 
import { OutreachReport } from "@/features/question_details/components/OutreachReport";
export const QuestionsPage = ({
  currentUser,
  autoOpenQuestionId,
}: {
  currentUser?: IUser;
  autoOpenQuestionId?: string | null;
}) => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuestionFilterStatus>("all");
  const [source, setSource] = useState<QuestionSourceFilter>("all");
  const [priority, setPriority] = useState<QuestionPriorityFilter>("all");
  const [state, setState] = useState("all");
  const [crop, setCrop] = useState("all");
  const [answersCount, setAnswersCount] = useState<[number, number]>([0, 100]);
  const [dateRange, setDateRange] = useState<QuestionDateRangeFilter>("all");
  const [startTime, setStartTime] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState<Date | undefined>(undefined);
  const [review_level, setReviewLevel] = useState<ReviewLevel>("all");
  const [closedAtStart, setClosedAtStart] = useState<Date | undefined>(
    undefined,
  );
  const [consecutiveApprovals, setConsecutiveApprovals] = useState("all");
  const [autoAllocateFilter, setAutoAllocateFilter] = useState("all");
  const [closedAtEnd, setClosedAtEnd] = useState<Date | undefined>(undefined);

  // const observerRef = useRef<IntersectionObserver | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [domain, setDomain] = useState("all");
  const [user, setUser] = useState("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    autoOpenQuestionId || "",
  );

  const [uploadedQuestionsCount, setUploadedQuestionsCount] = useState(0); // to track the bulk uploaded file size to run timer
  const [isBulkUpload, setIsBulkUpload] = useState(false);
  const debouncedSearch = useDebounce(search);

  // for Select mulitple questions and bulk delete
  const [isSelectionModeOn, setIsSelectionModeOn] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"all" | "review-level">("all");
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewLimit] = useState(10);
  const [showOutreachPanel, setShowOutreachPanel] = useState(false);

  //handle sort by turn around time
  const [sort, setSort] = useState("");
  const toggleSort = (key: string) => {
    if (key === "clearSort") {
      setSort("");
      return;
    }
    setSort((prev) => {
      if (prev === `${key}___asc`) return `${key}___desc`;
      return `${key}___asc`;
    });
  };

  const { mutateAsync: bulkDeleteQuestions, isPending: bulkDeletingQuestions } =
    useBulkDeleteQuestions();

  const LIMIT = 11;
  const filter = useMemo(
    () => ({
      status,
      state,
      source,
      crop,
      answersCount,
      dateRange,
      priority,
      domain,
      user,
      startTime,
      endTime,
      review_level,
      closedAtStart,
      closedAtEnd,
      consecutiveApprovals,
      autoAllocateFilter,
    }),
    [
      status,
      state,
      source,
      crop,
      answersCount,
      dateRange,
      priority,
      domain,
      user,
      startTime,
      endTime,
      review_level,
      closedAtEnd,
      closedAtStart,
      consecutiveApprovals,
      autoAllocateFilter,
    ],
  );

  const {
    data: questionData,
    isLoading,
    refetch,
  } = useGetAllDetailedQuestions(
    currentPage,
    LIMIT,
    filter,
    debouncedSearch,
    viewMode === "all",
  );
  const {
    data: questionDetails,
    refetch: refechSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId);
  const { data: reviewData, isLoading: isReviewLoading } =
    useGetQuestionsAndLevel(
      reviewPage,
      reviewLimit,
      search,
      filter,
      viewMode === "review-level",
      sort,
    );
  const reviewRows = useMemo(
    () => (reviewData?.data ?? []).map(mapReviewQuestionToRow),
    [reviewData],
  );
  useEffect(() => {
    if (autoOpenQuestionId && autoOpenQuestionId !== selectedQuestionId) {
      setSelectedQuestionId(autoOpenQuestionId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [autoOpenQuestionId, selectedQuestionId]);

  useEffect(() => {
    if (selectedQuestionId && !autoOpenQuestionId) {
      setSelectedQuestionId("");
    }
  }, [filter, debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch === "") return;
    if (currentUser?.role !== "expert") onReset();
  }, [debouncedSearch]);

  const onChangeFilters = (next: {
    status?: QuestionFilterStatus;
    source?: QuestionSourceFilter;
    priority?: QuestionPriorityFilter;
    state?: string;
    crop?: string;
    domain?: string;
    user?: string;
    answersCount?: [number, number];
    dateRange?: QuestionDateRangeFilter;
    startTime?: Date | undefined;
    endTime?: Date | undefined;
    review_level?: ReviewLevel;
    closedAtEnd?: Date | undefined;
    closedAtStart?: Date | undefined;
    consecutiveApprovals?: string;
    autoAllocateFilter?: string;
  }) => {
    if (next.status !== undefined) setStatus(next.status);
    if (next.source !== undefined) setSource(next.source);
    if (next.state !== undefined) setState(next.state);
    if (next.crop !== undefined) setCrop(next.crop);
    if (next.answersCount !== undefined) setAnswersCount(next.answersCount);
    if (next.dateRange !== undefined) setDateRange(next.dateRange);
    if (next.priority !== undefined) setPriority(next.priority);
    if (next.domain !== undefined) setDomain(next.domain);
    if (next.user !== undefined) setUser(next.user);
    if (next.startTime !== undefined) setStartTime(next.startTime);
    if (next.endTime !== undefined) setEndTime(next.endTime);
    if (next.review_level !== undefined) setReviewLevel(next.review_level);
    if (next.closedAtStart !== undefined) setClosedAtStart(next.closedAtStart);
    if (next.closedAtEnd !== undefined) setClosedAtEnd(next.closedAtEnd);
    if (next.consecutiveApprovals !== undefined)
      setConsecutiveApprovals(next.consecutiveApprovals);
    if (next.autoAllocateFilter !== undefined)
      setAutoAllocateFilter(next.autoAllocateFilter);
    // Reset pagination to page 1 when filters are applied
    setCurrentPage(1);
    setReviewPage(1);
  };
  const [showClosedAt, setClosedAt] = useState(false);
  useEffect(() => {
    if (status == "closed" || closedAtStart != undefined) {
      setClosedAt(true);
    } else {
      setClosedAt(false);
    }
  }, [status, closedAtStart]);

  const onReset = () => {
    setStatus("all");
    setSource("all");
    setState("all");
    setCrop("all");
    setAnswersCount([0, 100]);
    setDateRange("all");
    setPriority("all");
    setDomain("all");
    setUser("all");
    setReviewLevel("all");
    setStartTime(undefined);
    setEndTime(undefined);
    setClosedAtEnd(undefined);
    setClosedAtStart(undefined);
    setConsecutiveApprovals("all");
    setAutoAllocateFilter("all");
  };

  const handleViewMore = (questoinId: string) => {
    setSelectedQuestionId(questoinId);
  };
  const goBack = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("comment")) {
      url.searchParams.delete("comment");
      window.history.replaceState({}, "", url.toString());
      setSelectedQuestionId("");
      return;
    }
    setSelectedQuestionId("");
  };

  const handleBulkDelete = async () => {
    if (!selectedQuestionIds || selectedQuestionIds.length <= 0) {
      toast.error("No questions found to delete. Please try again!");
      return;
    }

    try {
      await bulkDeleteQuestions(selectedQuestionIds);
      setSelectedQuestionIds([]);
      setIsSelectionModeOn(false);
    } catch (error) {
      console.error("Bulk delete error:", error);
    }
  };

  return (
    <main className={"mx-auto w-full p-4 md:p-6 space-y-6"}>
      {selectedQuestionId ? (
        isLoadingSelectedQuestion ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Spinner />
          </div>
        ) : (
          questionDetails && (
            <QuestionDetails
              question={questionDetails.data}
              currentUserId={questionDetails.currentUserId}
              refetchAnswers={refechSelectedQuestion}
              isRefetching={isLoadingSelectedQuestion}
              goBack={goBack}
              currentUser={currentUser!}
            />
          )
        )
      ) : (
        <>
          <QuestionsFilters
            search={search}
            setSearch={setSearch}
            appliedFilters={filter}
            setUploadedQuestionsCount={setUploadedQuestionsCount}
            setIsBulkUpload={setIsBulkUpload}
            states={STATES}
            onChange={onChangeFilters}
            onReset={onReset}
            crops={CROPS}
            refetch={() => {
              refetch();
              setIsRefreshing(true);
              setTimeout(() => {
                setIsRefreshing(false);
              }, 2000);
            }}
            totalQuestions={
              viewMode === "all"
                ? questionData?.totalCount || 0
                : reviewData?.totalDocs || 0
            }
            userRole={currentUser?.role!}
            isSelectionModeOn={isSelectionModeOn}
            handleBulkDelete={handleBulkDelete}
            selectedQuestionIds={selectedQuestionIds}
            setIsSelectionModeOn={setIsSelectionModeOn}
            setSelectedQuestionIds={setSelectedQuestionIds}
            bulkDeletingQuestions={bulkDeletingQuestions}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onSort={toggleSort}
            sort={sort}
          />

          {viewMode === "all" ? (
            <QuestionsTable
              items={questionData?.questions}
              onViewMore={handleViewMore}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              userRole={currentUser?.role!}
              limit={LIMIT}
              totalPages={questionData?.totalPages || 0}
              isLoading={isLoading || isRefreshing || bulkDeletingQuestions}
              isBulkUpload={isBulkUpload}
              uploadedQuestionsCount={uploadedQuestionsCount}
              selectedQuestionIds={selectedQuestionIds}
              setIsSelectionModeOn={setIsSelectionModeOn}
              setSelectedQuestionIds={setSelectedQuestionIds}
              showClosedAt={showClosedAt}
            />
          ) : (
            <ReviewLevelsTable
              data={reviewRows}
              isLoading={isReviewLoading}
              page={reviewPage}
              totalPages={reviewData?.totalPages || 0}
              onPageChange={setReviewPage}
              onViewMore={handleViewMore}
              toggleSort={toggleSort}
              sort={sort}
              limit={reviewLimit}
            />
          )}

          {currentUser?.role !== "expert" && (
            <div className="pt-6 border-t">
              {/* Left side: Outreach Report Component */}
                <div className="flex items-center gap-2 mb-4">
                  <Button
                    variant={showOutreachPanel ? "default" : "outline"}
                    onClick={() => setShowOutreachPanel(!showOutreachPanel)}
                    className="gap-2 justify-start"
                  >
                    <Mail className="w-4 h-4" />
                    {showOutreachPanel ? "Hide Outreach Report" : "Send Outreach Report"}
                  </Button>
                </div>
                
                {showOutreachPanel && (
                  <div className="max-w-4xl mx-auto">
                  <OutreachReport />
                </div>
                )}
              

            </div>
          )}
        </>
      )}
    </main>
  );
};
