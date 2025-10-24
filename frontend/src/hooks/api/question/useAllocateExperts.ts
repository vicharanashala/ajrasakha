import { QuestionService } from "@/hooks/services/questionService";
import type { IDetailedQuestion } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const questionService = new QuestionService();

export const useAllocateExpert = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["allocateExperts"],
    mutationFn: async ({
      questionId,
      experts,
    }: {
      questionId: string;
      experts: string[];
    }): Promise<IDetailedQuestion | null> => {
      return await questionService.allocateExperts(questionId, experts);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
    },
  });
};
