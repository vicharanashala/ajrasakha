import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { IRerouteHistoryResponse } from "@/types";

const questionService = new QuestionService();

export const useGetReRoutedQuestionFullData = (questionId: string | null) => {
  const { data, isLoading, error, refetch } = useQuery<
  IRerouteHistoryResponse | null,
    Error
  >({
    queryKey: ["rerouted_question_full_data", questionId],
    queryFn: async () => {
      if (!questionId) throw new Error("Question ID is required");
      return await questionService.getReRoutedQuestionFullDataById(questionId);
    },
    enabled: !!questionId,
  });

  return { data, isLoading, error, refetch };
};
