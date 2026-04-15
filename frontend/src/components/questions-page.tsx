import { useGetAllDetailedQuestions } from "@/hooks/api/question/useGetAllDetailedQuestions";
//import { QuestionsFilters, QuestionsTable } from "./questions-table";
import { QuestionsTable } from "../features/question-table-page/questions-table";
import { QuestionsFilters } from "../features/question-table-page/QuestionsFilters";
import { useEffect, useMemo, useState } from "react";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { QuestionDetails } from "./question-details";
import type { IUser } from "@/types";
import { CROPS, STATES } from "./advanced-question-filter";
import { useFilterStore } from "@/stores/filter-store";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { useBulkDeleteQuestions } from "@/hooks/api/question/useBulkDeleteQuestions";
import { toast } from "sonner";
import Spinner from "./atoms/spinner";
import { ReviewLevelsTable } from "@/features/questions/components/review-level/ReviewLevelsTable";
import { useGetQuestionsAndLevel } from "@/features/questions/hooks/useGetQuestionsAndLevel";
import { mapReviewQuestionToRow } from "@/features/questions/utils/mapReviewLevel";

export const QuestionsPage = ({
  currentUser,
  autoOpenQuestionId,
}: {
  currentUser?: IUser;
  autoOpenQuestionId?: string | null;
}) => {

  //grid or table
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");

  const { questionTable, resetQuestionTableFilter } =
    useFilterStore();

  // const observerRef = useRef<IntersectionObserver | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
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
  const [reviewLimit] = useState(12);

  //handle sort by turn around time
  const [sort, setSort] = useState("");
  const [questionSort, setQuestionSort] = useState("");
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

  const toggleQuestionSort = (key: string) => {
    if (key === "slno") {
      setQuestionSort("");
      return;
    }
    setQuestionSort((prev) => {
      if (prev === `${key}_asc`) return `${key}_desc`;
      return `${key}_asc`;
    });
  };

  const { mutateAsync: bulkDeleteQuestions, isPending: bulkDeletingQuestions } =
    useBulkDeleteQuestions();

  const LIMIT = 12;

  const {
    data: questionData,
    isLoading,
    refetch,
  } = useGetAllDetailedQuestions(
    currentPage,
    LIMIT,
    questionTable,
    debouncedSearch,
    viewMode === "all",
    questionSort,
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
      questionTable,
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
  }, [questionTable, debouncedSearch]);

  useEffect(() => {
    if (debouncedSearch === "") return;
    if (currentUser?.role !== "expert") resetQuestionTableFilter();
  }, [debouncedSearch]);

  // Reset pagination whenever the applied filter changes.
  useEffect(() => {
    setCurrentPage(1);
    setReviewPage(1);
  }, [questionTable]);

  const showClosedAt =
    questionTable.status === "closed" || questionTable.closedAtStart != null;

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
              navigateToQuestionPage={() => {
                setSelectedQuestionId("");
              }}
              currentUser={currentUser!}
            />
          )
        )
      ) : (
        <>
          <QuestionsFilters
            search={search}
            setSearch={setSearch}
            setUploadedQuestionsCount={setUploadedQuestionsCount}
            setIsBulkUpload={setIsBulkUpload}
            states={STATES}
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
            showClosedAt={showClosedAt}
            view={view}
            setView={setView}
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
              isSelectionModeOn={isSelectionModeOn}
              setSelectedQuestionIds={setSelectedQuestionIds}
              showClosedAt={showClosedAt}
              sort={questionSort}
              onSort={toggleQuestionSort}
              view={view}
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
              view={view}
            />
          )}
        </>
      )}
    </main>
  );
};
