import { useGetAllDetailedQuestions } from "@/hooks/api/question/useGetAllDetailedQuestions";
import { QuestionsFilters, QuestionsTable } from "./questions-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { QuestionDetails } from "./question-details";
import type { QuestionPriority, UserRole } from "@/types";
import {
  CROPS,
  STATES,
  type QuestionDateRangeFilter,
  type QuestionFilterStatus,
  type QuestionPriorityFilter,
  type QuestionSourceFilter,
} from "./advanced-question-filter";

export const QuestionsPage = ({userRole}:{userRole?: UserRole}) => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuestionFilterStatus>("all");
  const [source, setSource] = useState<QuestionSourceFilter>("all");
  const [priority, setPriority] = useState<QuestionPriorityFilter>("all");
  const [state, setState] = useState("");
  const [crop, setCrop] = useState("");
  const [answersCount, setAnswersCount] = useState<[number, number]>([0, 100]);
  const [dateRange, setDateRange] = useState<QuestionDateRangeFilter>("all");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [domain, setDomain] = useState("all");
  const [user, setUser] = useState("all");
  const LIMIT = 12;
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
    ]
  );
  // const {
  //   data,
  //   fetchNextPage,
  //   hasNextPage,
  //   isFetchingNextPage,
  //   isLoading,
  //   refetch,
  // } = useGetAllDetailedQuestions(LIMIT, filter, search);
  const {
    data: questionData,
    isLoading,
    refetch,
  } = useGetAllDetailedQuestions(currentPage, LIMIT, filter, search);
  const {
    data: questionDetails,
    refetch: refechSelectedQuestion,
    isLoading: isLoadingSelectedQuestion,
  } = useGetQuestionFullDataById(selectedQuestionId);
  // const questions = data?.pages.flatMap((page) => page ?? []) ?? [];

  // const lastElementRef = useCallback(
  //   (node: HTMLElement | null) => {
  //     if (isFetchingNextPage) return;

  //     if (observerRef.current) observerRef.current.disconnect();

  //     observerRef.current = new IntersectionObserver(
  //       (entries) => {
  //         if (entries[0].isIntersecting && hasNextPage) {
  //           fetchNextPage();
  //         }
  //       },
  //       {
  //         root: document.querySelector(".overflow-y-auto"),
  //         rootMargin: "0px",
  //         threshold: 1.0,
  //       }
  //     );

  //     if (node) observerRef.current.observe(node);
  //   },
  //   [isFetchingNextPage, hasNextPage, fetchNextPage]
  // );

  // useEffect(() => {
  //   if (observerRef.current) {
  //     observerRef.current.disconnect();
  //   }
  //   refetch();
  // }, [filter, refetch]);

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
  };

  const handleViewMore = (questoinId: string) => {
    setSelectedQuestionId(questoinId);
  };

  return (
    <main className="mx-auto w-full p-4 md:p-6 space-y-6 ">
      {selectedQuestionId && questionDetails ? (
        <>
          <QuestionDetails
            question={questionDetails.data}
            currentUserId={questionDetails.currentUserId}
            refetchAnswers={refechSelectedQuestion}
            isRefetching={isLoadingSelectedQuestion}
            goBack={() => setSelectedQuestionId("")}
          />
        </>
      ) : (
        <>
          <QuestionsFilters
            search={search}
            setSearch={setSearch}
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
            userRole={userRole!}
          />

          <QuestionsTable
            items={questionData?.questions}
            onViewMore={handleViewMore}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            userRole={userRole}
            // hasMore={hasNextPage}
            // isLoadingMore={isFetchingNextPage}
            // lastElementRef={lastElementRef}
            totalPages={questionData?.totalPages || 0}
            isLoading={isLoading || isRefreshing}
          />
        </>
      )}
    </main>
  );
};
