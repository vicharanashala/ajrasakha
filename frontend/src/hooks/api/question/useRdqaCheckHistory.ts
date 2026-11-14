import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export function useRdqaCheckHistory(questionId?: string) {
  return useQuery({
    queryKey: ["rdqa-check-history", questionId],
    queryFn: () => (questionId ? questionService.getRdqaCheckHistory(questionId) : Promise.resolve([])),
    enabled: Boolean(questionId),
    staleTime: 15 * 1000,
  });
}

