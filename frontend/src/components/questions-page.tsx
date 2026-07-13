import { useGetAllDetailedQuestions } from "@/hooks/api/question/useGetAllDetailedQuestions";
import { QuestionsTable } from "../features/question-table-page/questions-table";
import { QuestionsFilters } from "../features/question-table-page/QuestionsFilters";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useBulkAllocatePaeExperts } from "@/hooks/api/question/useBulkAllocatePaeExperts";
import { toast } from "sonner";
import Spinner from "./atoms/spinner";
import { ReviewLevelsTable } from "@/features/questions/components/review-level/ReviewLevelsTable";
import { useGetQuestionsAndLevel } from "@/features/questions/hooks/useGetQuestionsAndLevel";
import { mapReviewQuestionToRow } from "@/features/questions/utils/mapReviewLevel";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";

export const QuestionsPage = ({
  currentUser,
  autoOpenQuestionId,
}: {
  currentUser?: IUser;
  autoOpenQuestionId?: string | null;
}) => {
  const {
    selectedQuestionId: routeQuestionId,
    selectedCommentId: routeCommentId,
    setSelectedQuestionId: setRouteQuestionId,
    setSelectedCommentId: setRouteCommentId,
    setSelectedQuestionType,
  } = useSelectedQuestion();

  const getInitialSource = (): QuestionSourceFilter => {
    const sourceFromUrl = new URLSearchParams(window.location.search).get(
      "source",
    );
    if (
      sourceFromUrl === "all" ||
      sourceFromUrl === "AJRASAKHA" ||
      sourceFromUrl === "AGRI_EXPERT" ||
      sourceFromUrl === "OUTREACH" ||
      sourceFromUrl === "WHATSAPP"
    ) {
      return sourceFromUrl;
    }
    return "AJRASAKHA";
  };

  //grid or table
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [searchTabMode, setSearchTabMode] = useState<string>("search");
  const [status, setStatus] = useState<QuestionFilterStatus>("all");
  const [source, setSource] = useState<QuestionSourceFilter>(getInitialSource);
  const [priority, setPriority] = useState<QuestionPriorityFilter>("all");
  const [state, setState] = useState("all");
  const [states, setStates] = useState<string[]>([]);
  const [crop, setCrop] = useState("all");
  const [normalisedCrop, setNormalisedCrop] = useState("all");
  const [normalisedCrops, setNormalisedCrops] = useState<string[]>([]);
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
  const [autoAllocateModeratorFilter, setAutoAllocateModeratorFilter] = useState("all");
  const [hiddenQuestions, setHiddenQuestions] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [unallocatedQuestions, setUnallocatedQuestions] = useState(false);
  const [duplicateQuestions, setDuplicateQuestions] = useState(false);
  const [paeReview, setPaeReview] = useState<boolean | undefined>(undefined);
  const [isNonAgri, setIsNonAgri] = useState<boolean | undefined>(undefined);
  const [closedAtEnd, setClosedAtEnd] = useState<Date | undefined>(undefined);
  const [closedInTwoHrs, setClosedInTwoHrs] = useState<boolean>(false);

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
  const [viewMode, setViewMode] = useState<"all" | "review-level" | "dedicated">("all");
  const [reviewPage, setReviewPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [pendingNav, setPendingNav] = useState<"prev" | "next" | null>(null);
  const suppressAutoOpenRef = useRef(false);

  useEffect(() => {
    setCurrentPage(1);
    setReviewPage(1);
  }, [limit]);

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
  const { mutateAsync: bulkAllocatePaeExperts, isPending: isBulkAllocatingPae } =
    useBulkAllocatePaeExperts();


  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("source", source);
    window.history.replaceState({}, "", url.toString());

    return () => {
      const cleanupUrl = new URL(window.location.href);
      cleanupUrl.searchParams.delete("source");
      window.history.replaceState({}, "", cleanupUrl.toString());
    };
  }, [source]);

  const filter = useMemo(
    () => {
      const isDedicated = viewMode === "dedicated";
      return {
        // In dedicated mode: ignore source/status filters so ALL assigned questions show
        status: isDedicated ? "all" : status,
        source: isDedicated ? "all" : source,
        state,
        states,
        crop,
        normalised_crop: normalisedCrop,
        normalisedCrops,
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
        autoAllocateModeratorFilter,
        closedInTwoHrs,
        hiddenQuestions,
        duplicateQuestions,
        isOnHold,
        unallocatedQuestions,
        pae_review: paeReview,
        is_non_agri: isNonAgri,
        // Dedicated ("My Assignment") tab: filter to questions assigned to the current
        // user, by their role — moderator, gate keeper, or auditor.
        moderatorId:
          isDedicated && currentUser?.role === "moderator"
            ? currentUser?._id?.toString() ?? undefined
            : undefined,
        gateKeeperId:
          isDedicated && currentUser?.role === "gate_keeper"
            ? currentUser?._id?.toString() ?? undefined
            : undefined,
        auditorId:
          isDedicated && currentUser?.role === "auditor"
            ? currentUser?._id?.toString() ?? undefined
            : undefined,
      };
    },
    [
      status,
      state,
      states,
      source,
      crop,
      normalisedCrop,
      normalisedCrops,
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
      autoAllocateModeratorFilter,
      closedInTwoHrs,
      hiddenQuestions,
      duplicateQuestions,
      isOnHold,
      unallocatedQuestions,
      paeReview,
      isNonAgri,
      viewMode,
      currentUser,
    ],
  );

  const {
    data: questionData,
    isLoading,
    isFetching,
    refetch,
  } = useGetAllDetailedQuestions(
    currentPage,
    limit,
    filter,
    debouncedSearch,
    viewMode === "all" || viewMode === "dedicated",
    questionSort,
  );
  const {
    data: questionDetails,
    refetch: refechSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId);

  const { data: reviewData, isLoading: isReviewLoading, refetch: refetchReviewLevels } =
    useGetQuestionsAndLevel(
      reviewPage,
      limit,
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
    if (suppressAutoOpenRef.current) {
      if (!autoOpenQuestionId) {
        suppressAutoOpenRef.current = false;
        setSelectedQuestionId("");
      }
      return;
    }

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


  const sourceByMode: Record<string, string> = {
    ajraskha: "AJRASAKHA",
    manual: "AGRI_EXPERT",
    whatsapp: "WHATSAPP",
    outreach: "OUTREACH",
  };

  const filteredQuestions = useMemo(() => {
    const questions = questionData?.questions || [];
    if (!debouncedSearch || searchTabMode === "search") return questions;
    const srcFilter = sourceByMode[searchTabMode];
    if (srcFilter) return questions.filter((q) => q.source === srcFilter);
    if (searchTabMode === "draft") return questions.filter((q) => q.status === "draft");
    if (searchTabMode === "non_agri") return questions.filter((q) => q.status === "non_agri");
    if (searchTabMode === "pae") return questions.filter((q) => (q as any).pae_review === true);
    if (searchTabMode === "dynamic") return questions.filter((q) => q.status === "dynamic");
    return questions;
  }, [questionData, debouncedSearch, searchTabMode]);

  const currentItems = useMemo(() => {
    if (viewMode === "review-level") return reviewData?.data || [];
    return filteredQuestions;
  }, [viewMode, filteredQuestions, reviewData]);

  const currentIndex = useMemo(() => {
    return currentItems.findIndex((q) => q._id === selectedQuestionId);
  }, [currentItems, selectedQuestionId]);

  const totalPages = viewMode === "review-level"
    ? (reviewData?.totalPages || 0)
    : (questionData?.totalPages || 0);

  const displayTotal = viewMode === "review-level"
    ? (reviewData?.totalDocs || 0)
    : (questionData?.totalCount || 0);
  const currentPageVal = viewMode === "review-level" ? reviewPage : currentPage;

  // If the active page falls outside the available range — e.g. returning from a
  // question's details to a view (like My Assignments) that has fewer pages — snap
  // back to the last valid page so the list isn't stuck on an empty out-of-range page.
  useEffect(() => {
    if (viewMode !== "review-level" && totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [viewMode, totalPages, currentPage]);

  const hasNext = currentIndex < currentItems.length - 1 || currentPageVal < totalPages;
  const hasPrev = currentIndex > 0 || currentPageVal > 1;

  const handleNext = () => {
    if (currentIndex < currentItems.length - 1) {
      setSelectedQuestionId(currentItems[currentIndex + 1]._id);
    } else if (currentPageVal < totalPages) {
      setPendingNav("next");
      if (viewMode === "review-level") setReviewPage(prev => prev + 1);
      else setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setSelectedQuestionId(currentItems[currentIndex - 1]._id);
    } else if (currentPageVal > 1) {
      setPendingNav("prev");
      if (viewMode === "review-level") setReviewPage(prev => prev - 1);
      else setCurrentPage(prev => prev - 1);
    }
  };

  useEffect(() => {
    if (pendingNav && !isLoading && !isFetching && !isReviewLoading && currentItems.length > 0) {
      if (pendingNav === "next") {
        setSelectedQuestionId(currentItems[0]._id);
      } else {
        setSelectedQuestionId(currentItems[currentItems.length - 1]._id);
      }
      setPendingNav(null);
    }
  }, [pendingNav, isLoading, isReviewLoading, currentItems]);

  const onChangeFilters = (next: {
    status?: QuestionFilterStatus;
    source?: QuestionSourceFilter;
    priority?: QuestionPriorityFilter;
    state?: string;
    states?: string[];
    crop?: string;
    normalised_crop?: string;
    normalisedCrops?: string[];
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
    autoAllocateModeratorFilter?: string;
    closedInTwoHrs?: boolean;
    hiddenQuestions?: boolean;
    duplicateQuestions?: boolean;
    isOnHold?: boolean;
    unallocatedQuestions?: boolean;
    pae_review?: boolean;
    is_non_agri?: boolean;
  }) => {
    if (next.status !== undefined) setStatus(next.status);
    if (next.source !== undefined) setSource(next.source);
    if (next.state !== undefined) setState(next.state);
    if (next.states !== undefined) setStates(next.states);
    if (next.crop !== undefined) setCrop(next.crop);
    if (next.normalised_crop !== undefined) setNormalisedCrop(next.normalised_crop);
    if (next.normalisedCrops !== undefined) setNormalisedCrops(next.normalisedCrops);
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
    if (next.autoAllocateModeratorFilter !== undefined)
      setAutoAllocateModeratorFilter(next.autoAllocateModeratorFilter);
    if (next.closedInTwoHrs !== undefined)
      setClosedInTwoHrs(next.closedInTwoHrs);    
    if (next.hiddenQuestions !== undefined)
      setHiddenQuestions(next.hiddenQuestions);
    if (next.duplicateQuestions !== undefined)
      setDuplicateQuestions(next.duplicateQuestions);
    if (next.isOnHold !== undefined)
      setIsOnHold(next.isOnHold);
    if (next.unallocatedQuestions !== undefined)
      setUnallocatedQuestions(next.unallocatedQuestions);
    if ("pae_review" in next)
      setPaeReview(next.pae_review);
    if ("is_non_agri" in next)
      setIsNonAgri(next.is_non_agri);
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
    setStates([]);
    setCrop("all");
    setNormalisedCrop("all");
    setNormalisedCrops([]);
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
    setAutoAllocateModeratorFilter("all");
    setClosedInTwoHrs(false);
    setHiddenQuestions(false);
    setDuplicateQuestions(false);
    setIsOnHold(false);
    setPaeReview(undefined);
    setIsNonAgri(undefined);
  };

  const handleViewMore = (questoinId: string) => {
    setSelectedQuestionId(questoinId);
  };
  const goBack = () => {
    if (routeCommentId || routeQuestionId) {
      suppressAutoOpenRef.current = true;
    }
    if (routeCommentId) {
      setRouteCommentId(null);
    }
    if (routeQuestionId) {
      setRouteQuestionId(null);
      setSelectedQuestionType(null);
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

  const handleBulkAllocateToPae = async (paeExpertId: string) => {
    if (!selectedQuestionIds || selectedQuestionIds.length === 0) {
      toast.error("No questions selected.");
      return;
    }

    try {
      // Send all selected IDs directly — the worker validates draft status per question
      // and skips non-draft ones. We must NOT filter through questionData (current page only).
      await bulkAllocatePaeExperts({ questionIds: selectedQuestionIds, paeExpertId });
      setSelectedQuestionIds([]);
      setIsSelectionModeOn(false);
      setTimeout(() => refetch(), 3000);
      toast.success(
        `Allocating ${selectedQuestionIds.length} question(s) to PAE in background.`,
      );
    } catch (error) {
      console.error("Bulk PAE allocate error:", error);
      toast.error("Failed to start PAE allocation. Please try again.");
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
              onNext={handleNext}
              onPrev={handlePrev}
              hasNext={hasNext}
              hasPrev={hasPrev}
              isDedicatedView={viewMode === "dedicated"}
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
            }}
            totalQuestions={displayTotal}
            userRole={currentUser?.role!}
            isSelectionModeOn={isSelectionModeOn}
            handleBulkDelete={handleBulkDelete}
            selectedQuestionIds={selectedQuestionIds}
            setIsSelectionModeOn={setIsSelectionModeOn}
            setSelectedQuestionIds={setSelectedQuestionIds}
            bulkDeletingQuestions={bulkDeletingQuestions}
            handleBulkAllocateToPae={handleBulkAllocateToPae}
            isBulkAllocatingPae={isBulkAllocatingPae}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onSort={toggleSort}
            sort={sort}
            showClosedAt={showClosedAt}
            view={view}
            setView={setView}
            onAnswerModeChange={setSearchTabMode}
          />

          {viewMode === "all" || viewMode === "dedicated" ? (
            <QuestionsTable
              items={filteredQuestions}
              onViewMore={handleViewMore}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              userRole={currentUser?.role!}
              limit={limit}
              totalPages={totalPages}
              isLoading={isLoading || isFetching || bulkDeletingQuestions}
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
              setLimit={setLimit}
              isDedicatedView={viewMode === "dedicated"}
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
              limit={limit}
              onLimitChange={setLimit}
              view={view}
              onRefresh={refetchReviewLevels}
            />
          )}
        </>
      )}
    </main>
  );
};
