import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export const useManualCheckDuplicate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["manualCheckDuplicate"],
    mutationFn: async (questionId: string) => {
      return await questionService.manualCheckDuplicate(questionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
  });
};
