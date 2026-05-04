import { QuestionService } from "@/hooks/services/questionService";
import type { IDetailedQuestion } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const questionService = new QuestionService();

export const useReplaceQueueExpert = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["replaceQueueExpert"],
    mutationFn: async ({
      questionId,
      levelIndex,
      newExpertId,
      isAuthor,
      reasonForChange,
    }: {
      questionId: string;
      levelIndex: number;
      newExpertId: string;
      isAuthor?: boolean;
      reasonForChange?: string;
    }): Promise<IDetailedQuestion | null> => {
      return await questionService.replaceQueueExpert(questionId, levelIndex, newExpertId, isAuthor, reasonForChange);
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["question_full_data", variables.questionId],
      });
      await queryClient.invalidateQueries({ queryKey: ["questions_levels"] });
      // Small delay to ensure MongoDB aggregation uses fresh $$NOW value
      await new Promise(resolve => setTimeout(resolve, 500));
    },
  });
};
