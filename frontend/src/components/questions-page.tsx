import { useGetAllDetailedQuestions } from "@/hooks/api/question/useGetAllDetailedQuestions";
import { QuestionsFilters, QuestionsTable } from "./questions-table";
import { useEffect, useMemo, useState } from "react";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { useGetReRoutedQuestionFullData } from "@/hooks/api/question/useGetReRoutedQuestionFullData";
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
  const [state, setState] = useState("");
  const [crop, setCrop] = useState("");
  const [answersCount, setAnswersCount] = useState<[number, number]>([0, 100]);
  const [dateRange, setDateRange] = useState<QuestionDateRangeFilter>("all");
  const [startTime, setStartTime] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState<Date | undefined>(undefined);
  const [review_level, setReviewLevel] = useState<ReviewLevel>("all");
  const [closedAtStart, setClosedAtStart] = useState<Date | undefined>(undefined);
  const [closedAtEnd, setClosedAtEnd] = useState<Date | undefined>(undefined);

  // const observerRef = useRef<IntersectionObserver | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [domain, setDomain] = useState("all");
  const [user, setUser] = useState("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    autoOpenQuestionId || ""
  );

  const [uploadedQuestionsCount, setUploadedQuestionsCount] = useState(0); // to track the bulk uploaded file size to run timer
  const [isBulkUpload, setIsBulkUpload] = useState(false);
  const debouncedSearch = useDebounce(search);

  // for Select mulitple questions and bulk delete
  const [isSelectionModeOn, setIsSelectionModeOn] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

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
      closedAtEnd
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
      closedAtStart
    ]
  );

  const {
    data: questionData,
    isLoading,
    refetch,
  } = useGetAllDetailedQuestions(currentPage, LIMIT, filter, debouncedSearch);
  const {
    data: questionDetails,
    refetch: refechSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId);

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
    if (currentUser?.role !== "expert") onReset(); // Reset filters on search change for non-experts
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
    closedAtEnd?:Date|undefined,
    closedAtStart?:Date|undefined
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
  };

  const onReset = () => {
    setStatus("all");
    setSource("all");
    setState("");
    setCrop("");
    setAnswersCount([0, 100]);
    setDateRange("all");
    setPriority("all");
    setDomain("all");
    setUser("all");
    setReviewLevel("all");
    setStartTime(undefined)
    setEndTime(undefined)
    setClosedAtEnd(undefined)
    setClosedAtStart(undefined)
   

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
            totalQuestions={questionData?.totalCount || 0}
            userRole={currentUser?.role!}
            isSelectionModeOn={isSelectionModeOn}
            handleBulkDelete={handleBulkDelete}
            selectedQuestionIds={selectedQuestionIds}
            setIsSelectionModeOn={setIsSelectionModeOn}
            setSelectedQuestionIds={setSelectedQuestionIds}
            bulkDeletingQuestions={bulkDeletingQuestions}
          />

          <QuestionsTable
            items={questionData?.questions}
            onViewMore={handleViewMore}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            userRole={currentUser?.role!}
            limit={LIMIT}
            // hasMore={hasNextPage}
            // isLoadingMore={isFetchingNextPage}
            // lastElementRef={lastElementRef}
            totalPages={questionData?.totalPages || 0}
            isLoading={isLoading || isRefreshing || bulkDeletingQuestions}
            isBulkUpload={isBulkUpload}
            uploadedQuestionsCount={uploadedQuestionsCount}
            selectedQuestionIds={selectedQuestionIds}
            setIsSelectionModeOn={setIsSelectionModeOn}
            setSelectedQuestionIds={setSelectedQuestionIds}
          />
        </>
      )}
    </main>
  );
};
