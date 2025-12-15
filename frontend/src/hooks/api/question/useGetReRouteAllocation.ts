import { QuestionService } from "@/hooks/services/questionService";
import type { IDetailedQuestion } from "@/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const questionService = new QuestionService();

export const useGetReRouteAllocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["allocateExperts"],
    mutationFn: async ({
      questionId,
      experts,
      moderatorId,
      answerId,
      comment,
      status
    }: {
      questionId: string;
      experts: string;
      moderatorId:string|undefined;
      answerId:string|undefined,
      comment:string;
      status:string
    }): Promise<IDetailedQuestion | null> => {
      return await questionService.allocateReRouteExperts(questionId, experts,moderatorId,answerId,comment,status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
    },
  });
};
