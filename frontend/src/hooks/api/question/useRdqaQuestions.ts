import { useQuery } from "@tanstack/react-query";
import { QuestionService, type RdqaQuestion, type RdqaQuestionsResponse } from "../../services/questionService";

const questionService = new QuestionService();

export function useRdqaQuestions(date?: string, limit?: number) {
  return useQuery<RdqaQuestionsResponse>({
    queryKey: ["rdqa-questions", date, limit],
    queryFn: () => questionService.getRdqaQuestions(date, limit),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export type { RdqaQuestion, RdqaQuestionsResponse };