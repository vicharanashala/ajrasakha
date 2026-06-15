import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import type {
  IReviewParmeters,
  SourceItem,
  SubmitAnswerResponse,
} from "@/types";
import { useToast } from "@/shared/components/toast";

export interface IReviewAnswerPayload {
  questionId: string;
  status: "accepted" | "rejected" | "modified";
  answer?: string;
  sources?: SourceItem[];
  reasonForRejection?: string;
  approvedAnswer?: string;
  rejectedAnswer?: string;
  modifiedAnswer?: string;
  reasonForModification?: string;
  parameters: IReviewParmeters;
  remarks: string;
  type?:string
}
const questionService = new AnswerService();
export const useReviewAnswer = () => {
  const {loading: toastLoading, success: toastSuccess, error: toastError, dismiss: toastDismiss} = useToast()
  const queryClient = useQueryClient();
  return useMutation<SubmitAnswerResponse | null, Error, IReviewAnswerPayload, {toastId:string}>({
    onMutate: () => {
      const toastId = toastLoading('Submitting Response...', {
        desc: "please wait while submiting the response"
      })

      return { toastId };
    },
    mutationFn: async ({
      questionId,
      status,
      answer,
      sources,
      reasonForRejection,
      approvedAnswer,
      rejectedAnswer,
      modifiedAnswer,
      reasonForModification,
      parameters,
      remarks,
      type
    }) => {
      try {
        return await questionService.reviewAnswer({
          status,
          questionId,
          answer,
          sources,
          reasonForRejection,
          approvedAnswer,
          rejectedAnswer,
          modifiedAnswer,
          reasonForModification,
          parameters,
          remarks,
          type
        });
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    onSuccess: (_,__,context) => {
      if (context?.toastId)toastDismiss(context.toastId);
      toastSuccess("Your response has been submitted. Thank you!");
      queryClient.invalidateQueries({ queryKey: ["question"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (error,_,context) => {
      if (context?.toastId)toastDismiss(context.toastId);
      toastError(error.message || "Failed to submit response! Try again.");
      console.error("Failed to submit response:", error.message);
    },
  });
};
