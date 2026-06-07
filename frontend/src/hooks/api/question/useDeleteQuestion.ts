import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { useToast } from "@/shared/components/toast";

const questionService = new QuestionService();

export const useDeleteQuestion = () => {
  const {loading: toastLoading, success: toastSuccess, error: toastError, dismiss: toastDismiss} = useToast()
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: ()=> {
      const toastId = toastLoading('deleting the question...',{
        desc: "please wait while deleting the question"
      })

      return { toastId }
    },
    mutationKey: ["deleteQuestion"],
    mutationFn: async (questionId: string): Promise<void> => {
      await questionService.deleteQuestion(questionId);
    },
    onSuccess: (_,__,context) => {
      if(context?.toastId)toastDismiss(context.toastId)
      toastSuccess("Question deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
    onError: (error: any,_,context) => {
      if(context?.toastId)toastDismiss(context.toastId)
      toastError("Failed to delete question");
      console.error("Delete question error:", error);
    },
  });
};
