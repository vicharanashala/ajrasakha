import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { useToast } from "@/shared/components/toast";

const questionService = new QuestionService();

export const useBulkDeleteQuestions = () => {
  const {loading: toastLoading, success: toastSuccess, error: toastError, dismiss: toastDismiss} = useToast()
  const queryClient = useQueryClient();

  return useMutation({

    onMutate: () => {
      const toastId = toastLoading('deleting questions...',{
        desc: "please wait while deleting the question"
      })

      return {toastId};
    },
    mutationKey: ["bulkDeleteQuestions"],
    mutationFn: async (
      questionIds: string[]
    ): Promise<{ message: string; jobId: string } | null> => {
      return questionService.bulkDeleteQuestions(questionIds);
    },
    onSuccess: (data,_,context) => {
      if (context?.toastId)toastDismiss(context.toastId);
      if (data)
        toastSuccess(data.message || "Deletion started in background");
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
    onError: (_,__,context) => {
      if (context?.toastId)toastDismiss(context.toastId);
      toastError("Failed to delete questions");
    },
  });
};
