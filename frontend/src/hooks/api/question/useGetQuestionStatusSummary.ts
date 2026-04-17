import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { AdvanceFilterValues } from "../../components/advanced-question-filter";

const questionService = new QuestionService();

export type QuestionStatusSummary = {
  totalQuestions: number;
  statuses: { status: string; count: number }[];
};

export const useGetQuestionStatusSummary = (
  filter: AdvanceFilterValues,
  search: string,
  enabled: boolean,
) => {
  return useQuery<QuestionStatusSummary | null, Error>({
    queryKey: ["question-status-summary", filter, search],
    queryFn: () => questionService.getQuestionStatusSummary(filter, search),
    enabled,
  });
};
