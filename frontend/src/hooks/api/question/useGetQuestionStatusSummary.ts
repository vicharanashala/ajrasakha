import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export type QuestionStatusSummary = {
  totalQuestions: number;
  statuses: { status: string; count: number }[];
};

export const useGetQuestionStatusSummary = (enabled: boolean) => {
  return useQuery<QuestionStatusSummary | null, Error>({
    queryKey: ["question-status-summary"],
    queryFn: () => questionService.getQuestionStatusSummary(),
    enabled,
  });
};
