import { useQuery } from "@tanstack/react-query";
import { QuestionService, type RdqaQuestion, type RdqaQuestionsResponse } from "../../services/questionService";

const questionService = new QuestionService();

export function useRdqaQuestions(date?: string, page = 1) {
  return useQuery<RdqaQuestionsResponse>({
    queryKey: ["rdqa-questions", date, page],
    queryFn: () => questionService.getRdqaQuestions(date, page),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export type { RdqaQuestion, RdqaQuestionsResponse };
