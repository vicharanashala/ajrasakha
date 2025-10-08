import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";
import type { IQuestion, QuestionFullDataResponse } from "@/types";

const questionService = new QuestionService();

export const useGetQuestionFullDataById = (questionId: string | null) => {
  const { data, isLoading, error } = useQuery<QuestionFullDataResponse | null, Error>({
    queryKey: ["question_full_data", questionId],
    queryFn: async () => {
      if (!questionId) throw new Error("Question ID is required");
      return await questionService.getQuestionFullDataById(questionId);
    },

    enabled: !!questionId,
  });

  return { data, isLoading, error };
};
