import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import { Input } from "@/components/atoms/input";
import { Pagination } from "@/components/pagination";
import { Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/ui/useDebounce";
import { useGetAllocatedQuestions } from "@/hooks/api/question/useGetAllocatedQuestions";
import type { IQuestion } from "@/types";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

interface ValidationsTabProps {
  userId?: string;
  expertDate?: {
    startTime?: Date;
    endTime?: Date;
  };
}

interface QuestionsListProps {
  userId?: string;
  expertDate?: {
    startTime?: Date;
    endTime?: Date;
  };
  onQuestionSelect?: (questionId: string) => void;
  selectedQuestionId?: string;
}

const QuestionsList = ({
  userId,
  expertDate,
  onQuestionSelect,
  selectedQuestionId,
}: QuestionsListProps) => {
  const [questionsPage, setQuestionsPage] = useState(1);
  const questionsLimit = 11;
  const [questionsSearch, setQuestionsSearch] = useState("");
  const debouncedQuestionsSearch = useDebounce(questionsSearch, 200);

  const allocatedPreferences = useMemo<AdvanceFilterValues>(
    () => ({
      status: "all",
      source: "all",
      state: "all",
      states: [],
      answersCount: [0, 100],
      dateRange: "all",
      user: userId || "all",
      domain: "all",
      crop: "all",
      crops: [],
      normalised_crop: "all",
      priority: "all",
      review_level: "all",
      startTime: expertDate?.startTime,
      endTime: expertDate?.endTime,
      hiddenQuestions: false,
      duplicateQuestions: false,
      isOnHold: false,
    }),
    [expertDate?.endTime, expertDate?.startTime, userId],
  );

  const {
    data: allocatedQuestionPages,
    isLoading: isQuestionsLoading,
    isFetching: isQuestionsFetching,
  } = useGetAllocatedQuestions(
    2000,
    "newest",
    allocatedPreferences,
    "allocated",
    null,
    "all",
    true,
  );

  const allAllocatedQuestions = useMemo<
    (IQuestion & { review_level_number?: string | number })[]
  >(() => {
    const flattened = allocatedQuestionPages?.pages?.flat() || [];
    return flattened as (IQuestion & { review_level_number?: string | number })[];
  }, [allocatedQuestionPages]);

  const filteredQuestions = useMemo(() => {
    const needle = debouncedQuestionsSearch.trim().toLowerCase();
    const sorted = [...allAllocatedQuestions].sort((a, b) => {
      const getLevel = (value: string | number | undefined) => {
        if (value === "Author" || value === 0) return 0;
        if (typeof value === "number") return value;
        if (typeof value === "string") {
          const parsed = Number(value.replace("Level", "").trim());
          return Number.isNaN(parsed) ? 999 : parsed;
        }
        return 999;
      };
      return getLevel(a.review_level_number) - getLevel(b.review_level_number);
    });
    if (!needle) return sorted;
    return sorted.filter((q) => (q.text || "").toLowerCase().includes(needle));
  }, [allAllocatedQuestions, debouncedQuestionsSearch]);

  const totalQuestionCount = filteredQuestions.length;
  const paginatedQuestions = useMemo(() => {
    const start = (questionsPage - 1) * questionsLimit;
    const end = start + questionsLimit;
    return filteredQuestions.slice(start, end);
  }, [filteredQuestions, questionsLimit, questionsPage]);
  const totalQuestionPages = Math.ceil(totalQuestionCount / questionsLimit);

  useEffect(() => {
    setQuestionsPage(1);
  }, [debouncedQuestionsSearch, expertDate?.endTime, expertDate?.startTime, userId]);

  const formatReviewLevel = (rawLevel: string | number | undefined) => {
    if (rawLevel === undefined || rawLevel === null) return "N/A";
    if (typeof rawLevel === "string") return rawLevel;
    return rawLevel === 0 ? "Author" : `Level ${rawLevel}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-1xl font-bold text-foreground mt-0 mb-3">Questions</h1>
        <Input
          value={questionsSearch}
          onChange={(e) => setQuestionsSearch(e.target.value)}
          placeholder="Search questions..."
          className="md:w-80"
        />
      </div>
      <div className="mb-2 text-sm text-muted-foreground">
        Total Questions: {totalQuestionCount}
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh]">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-center w-12">Sl.No</TableHead>
              <TableHead className="text-center w-12">Source</TableHead>
              <TableHead className="text-left">Question Text</TableHead>
              <TableHead className="text-center w-52">Review Level</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isQuestionsLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-10">
                  <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : paginatedQuestions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                  No questions found
                </TableCell>
              </TableRow>
            ) : (
              paginatedQuestions.map((question, index: number) => (
                <TableRow
                  key={question.id ?? index}
                  onClick={() => question.id && onQuestionSelect?.(question.id)}
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedQuestionId === question.id ? "bg-muted" : ""
                  }`}
                >
                  <TableCell className="align-top text-center">
                    {(questionsPage - 1) * questionsLimit + index + 1}
                  </TableCell>
                  <TableCell className={question.source === "AJRASAKHA"
                    ? "text-red-500" : question.source === "WHATSAPP"
                    ? "text-green-500" : question.source === "OUTREACH"
                    ? "text-orange-500" : question.source === "AGRI_EXPERT"
                    ? "text-gray-500" : "text-yellow-500"}>
                    {question.source}
                  </TableCell>
                  <TableCell className="align-top">{question.text}</TableCell>
                  <TableCell className="align-top text-center">
                    {formatReviewLevel(question.review_level_number)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {isQuestionsFetching && !isQuestionsLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin w-4 h-4" />
          Updating results...
        </div>
      ) : null}
      <Pagination
        currentPage={questionsPage}
        totalPages={totalQuestionPages}
        onPageChange={setQuestionsPage}
      />
    </div>
  );
};

export const ValidationsTab = ({ userId, expertDate }: ValidationsTabProps) => {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("");

  return (
    <div className="flex gap-4 min-h-[70vh]">
      <div className="w-1/2 border rounded-lg p-4 bg-card overflow-auto">
        <QuestionsList
          userId={userId}
          expertDate={expertDate}
          onQuestionSelect={setSelectedQuestionId}
          selectedQuestionId={selectedQuestionId}
        />
      </div>
      <div className="w-1/2 border rounded-lg p-4 bg-card flex items-center justify-center">
        {selectedQuestionId ? (
          <div className="text-center">
            <Loader2 className="animate-spin w-8 h-8 mx-auto text-primary mb-4" />
            <p className="text-lg font-medium text-foreground">In Progress</p>
            <p className="text-sm text-muted-foreground mt-2">
              Question validation in progress...
            </p>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <p className="text-sm">Select a question from the left to view details</p>
          </div>
        )}
      </div>
    </div>
  );
};