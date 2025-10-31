import { QuestionService } from "@/hooks/services/questionService";
import type { IDetailedQuestion } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const questionService = new QuestionService();

export const useToggleAutoAllocateQuestion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["toggleAutoAllocateQuestion"],
    mutationFn: async (
      questionId: string
    ): Promise<IDetailedQuestion | null> => {
      return await questionService.toggleAutoAllocate(questionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
    },
  });
};
