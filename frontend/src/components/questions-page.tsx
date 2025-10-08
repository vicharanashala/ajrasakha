import { useGetAllDetailedQuestions } from "@/hooks/api/question/useGetAllDetailedQuestions";
import { QuestionsFilters, QuestionsTable } from "./questions-table";
import { useCallback, useRef, useState } from "react";
import { useGetQuestionFullDataById } from "@/hooks/api/question/useGetQuestionFullData";
import { QuestionDetails } from "./question-details";

const STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export type QuestionStatus = "open" | "answered" | "closed";

export interface IDetailedQuestion {
  _id?: string;
  userId: string;
  question: string;
  context: string;
  status: QuestionStatus;
  totalAnswersCount: number;
  details: {
    state: string;
    district: string;
    crop: string;
    season: string;
    domain: string;
  };
  source: "AJRASAKHA" | "AGRI_EXPERT";
  createdAt?: string;
  updatedAt?: string;
}
export type QuestionFilterStatus = "all" | "open" | "answered" | "closed";
export type QuestionDateRangeFilter =
  | "all"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";
export type QuestionSourceFilter = "all" | "AJRASAKHA" | "AGRI_EXPERT";

export type AdvanceFilterValues = {
  status: QuestionFilterStatus;
  source: QuestionSourceFilter;
  state: string;
  answersCount: [number, number];
  dateRange: QuestionDateRangeFilter;
  crop: string;
};

export const QuestionsPage = () => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuestionFilterStatus>("all");
  const [source, setSource] = useState<QuestionSourceFilter>("all");
  const [state, setState] = useState("");
  const [crop, setCrop] = useState("");
  const [answersCount, setAnswersCount] = useState<[number, number]>([0, 100]);
  const [dateRange, setDateRange] = useState<QuestionDateRangeFilter>("all");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const LIMIT = 7;
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useGetAllDetailedQuestions(
    LIMIT,
    {
      status,
      state,
      source,
      crop,
      answersCount,
      dateRange,
    },
    search
  );
  const { data: questionDetails } =
    useGetQuestionFullDataById(selectedQuestionId);
  const questions = data?.pages.flatMap((page) => page ?? []) ?? [];

  const lastElementRef = useCallback(
    (node: HTMLElement | null) => {
      if (isFetchingNextPage) return;

      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage) {
            fetchNextPage();
          }
        },
        {
          root: document.querySelector(".overflow-y-auto"),
          rootMargin: "0px",
          threshold: 1.0,
        }
      );

      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage]
  );

  const onChangeFilters = (next: {
    status?: QuestionFilterStatus;
    source?: QuestionSourceFilter;
    state?: string;
    crop?: string;
    answersCount?: [number, number];
    dateRange?: QuestionDateRangeFilter;
  }) => {
    if (next.status !== undefined) setStatus(next.status);
    if (next.source !== undefined) setSource(next.source);
    if (next.state !== undefined) setState(next.state);
    if (next.crop !== undefined) setCrop(next.crop);
    if (next.answersCount !== undefined) setAnswersCount(next.answersCount);
    if (next.dateRange !== undefined) setDateRange(next.dateRange);
  };

  const onReset = () => {
    setStatus("all");
    setSource("all");
    setState("");
    setCrop("");
    setAnswersCount([0, 100]);
    setDateRange("all");
  };

  const handleViewMore = (questoinId: string) => {
    setSelectedQuestionId(questoinId);
  };

  const crops = ["Rice", "Wheat", "Cotton", "Sugarcane", "Vegetables"];

  return (
    <main className="mx-auto w-full p-4 md:p-6 space-y-6 ">
      {selectedQuestionId && questionDetails ? (
        <QuestionDetails question={questionDetails.data} currentUserId="" />
      ) : (
        <>
          <QuestionsFilters
            search={search}
            setSearch={setSearch}
            states={STATES}
            onChange={onChangeFilters}
            onReset={onReset}
            crops={crops}
            refetch={() => {
              refetch();
              setIsRefreshing(true);
              setTimeout(() => {
                setIsRefreshing(false);
              }, 2000);
            }}
          />

          <QuestionsTable
            items={questions}
            onViewMore={handleViewMore}
            hasMore={hasNextPage}
            isLoadingMore={isFetchingNextPage}
            lastElementRef={lastElementRef}
            isLoading={isLoading || isRefreshing}
          />
        </>
      )}
    </main>
  );
};
