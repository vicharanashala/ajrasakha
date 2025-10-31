import { QuestionService } from "@/hooks/services/questionService";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const questionService = new QuestionService();

export const useRemoveAllocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["removeAllocation"],
    mutationFn: async ({
      questionId,
      index,
    }: {
      questionId: string;
      index: number;
    }): Promise<void | null> => {
      return await questionService.removeAllocation(questionId, index);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["question_full_data", variables.questionId],
      });
    },
  });
};
