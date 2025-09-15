import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";
import type { IQuestion } from "@/types";

const questionService = new QuestionService();

export const useGetQuestionById = (questionId: string | null) => {
  const { data, isLoading, error } = useQuery<IQuestion | null, Error>({
    queryKey: ["question", questionId],
    queryFn: async () => {
      if (!questionId) throw new Error("Question ID is required");
      return await questionService.getQuestionById(questionId);
    },

    enabled: !!questionId,
  });

  return { data, isLoading, error };
};
