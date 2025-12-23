import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { RejectReRoutePayload } from "@/types";
const questionService = new QuestionService();

export const useReRouteRejectQuestion = () => {
  const queryClient = useQueryClient();

  const {
    mutateAsync: rejectReRoute,
    isPending,
    error,
    isSuccess,
  } = useMutation({
    mutationFn: async (payload: RejectReRoutePayload) => {
      return questionService.rejectRerouteRequest(payload);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
    },
    onError: (error: any) => {
      // Re-throw the error so it can be caught in the component
      throw error;
    }
  });

  return {
    rejectReRoute,
    isRejecting: isPending,
    error,
    isSuccess,
  };
};
