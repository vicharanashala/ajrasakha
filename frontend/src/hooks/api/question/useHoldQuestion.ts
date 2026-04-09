import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { IDetailedQuestion } from "@/types";

const questionService = new QuestionService();

export const useHoldQuestion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["holdQuestion"],
    mutationFn: async (questionId: string) => {
      return await questionService.holdQuestion(questionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
  });
};
