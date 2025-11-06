import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import { toast } from "sonner";
import type { SourceItem, SubmitAnswerResponse } from "@/types";

export interface IReviewAnswerPayload {
  questionId: string;
  status: "accepted" | "rejected";
  answer?: string;
  sources?: SourceItem[];
  reasonForRejection?: string;
  approvedAnswer?: string;
  rejectedAnswer?: string;
}
const questionService = new AnswerService();
export const useReviewAnswer = () => {
  const queryClient = useQueryClient();
  return useMutation<SubmitAnswerResponse | null, Error, IReviewAnswerPayload>({
    mutationFn: async ({
      questionId,
      status,
      answer,
      sources,
      reasonForRejection,
      approvedAnswer,
      rejectedAnswer,
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
        });
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit response! Try again.");
      console.error("Failed to submit response:", error.message);
    },
  });
};
