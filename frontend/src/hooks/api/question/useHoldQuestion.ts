import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export const useHoldQuestion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["holdQuestion"],
    mutationFn: async ({ questionId, action }: { questionId: string; action: "hold" | "unhold" }) => {
      return await questionService.holdQuestion(questionId, action);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
  });
};
