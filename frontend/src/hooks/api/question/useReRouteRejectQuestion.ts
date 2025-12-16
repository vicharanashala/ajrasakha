import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { RejectReRoutePayload } from "@/types";
const questionService = new QuestionService();

export const useReRouteRejectQuestion = () => {
  const queryClient = useQueryClient();

  const {
    mutate: rejectReRoute,
    isPending,
    error,
    isSuccess,
  } = useMutation({
    mutationFn: async (payload: RejectReRoutePayload) => {
      return questionService.rejectRerouteRequest(payload);
    },

    onSuccess: (_, variables) => {
      // ✅ invalidate question data so UI updates
      queryClient.invalidateQueries({
        queryKey: ["question", variables.questionId],
      });
    },
  });

  return {
    rejectReRoute,
    isRejecting: isPending,
    error,
    isSuccess,
  };
};
