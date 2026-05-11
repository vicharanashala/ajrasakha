import { QuestionService } from "@/hooks/services/questionService";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const questionService = new QuestionService();

export const useBulkAllocatePaeExperts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["bulkAllocatePaeExperts"],
    mutationFn: ({
      questionIds,
      paeExpertId,
    }: {
      questionIds: string[];
      paeExpertId: string;
    }) => questionService.bulkAllocatePaeExperts(questionIds, paeExpertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
    },
  });
};
