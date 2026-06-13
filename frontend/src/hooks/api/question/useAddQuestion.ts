import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { IDetailedQuestion } from "@/types";
import { useToast } from "@/shared/components/toast";

const questionService = new QuestionService();

export const useAddQuestion = (
  onUploaded?: (count: number, isBulkUpload: boolean) => void
) => {
  const {loading: toastLoading, success: toastSuccess, error: toastError, dismiss: toastDismiss} = useToast()
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: () => {
      const toastId = toastLoading('adding questions...',{
        desc: "please wait while adding the question"
      })

      return {toastId};
    },
    mutationKey: ["addQuestion"],
    mutationFn: async (
      newQuestionData: Partial<IDetailedQuestion> | FormData
    ) => {
      // return await questionService.addQuestion(newQuestionData);
      if (newQuestionData instanceof FormData) {
        return await questionService.addQuestion(newQuestionData, true);
      }
      return await questionService.addQuestion(newQuestionData);
    },
    onSuccess: (data: any,_,context) => {
      if (context?.toastId)toastDismiss(context.toastId);
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
      
      const count = data?.insertedIds?.length ?? data?.count ?? 0;
      const isBulk = Boolean(data?.isBulkUpload);

      if (count > 0) {
        onUploaded?.(count, isBulk);
      }
      if (data?.message) {
        toastSuccess(data.message);
      } else {
        toastSuccess("Question added successfully!");
      }
    },
    onError: (error: any,_,context) => {
      if (context?.toastId)toastDismiss(context.toastId);
      toastError(error?.message || "Failed to add question");
      console.error("Add question error:", error);
    },
  });
};
