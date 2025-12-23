import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { IQuestion } from "@/types";

const questionService = new QuestionService();

export const useGetQuestionById = (questionId: string | null,actionType:string) => {
  const { data, isLoading, error } = useQuery<IQuestion | null, Error>({
    queryKey: ["question", questionId,actionType],
    queryFn: async () => {
      if (!questionId) throw new Error("Question ID is required")
      return await questionService.getQuestionById(questionId,actionType);
    },

    enabled: !!questionId && !!actionType
    
  });

  return { data, isLoading, error };
};
