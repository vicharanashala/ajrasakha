import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import toast from "react-hot-toast";
import type { SubmitAnswerResponse } from "@/types";

const questionService = new AnswerService();
export const useSubmitAnswer = () => {
  const queryClient = useQueryClient();
  return useMutation<
    SubmitAnswerResponse | null,
    Error,
    {
      questionId: string;
      status: "accepted" | "rejected";
      answer?: string;
      sources?: string[];
      reasonForRejection?: string;
    }
  >({
    mutationFn: async ({
      questionId,
      status,
      answer,
      sources,
      reasonForRejection,
    }) => {
      try {
        return await questionService.reviewAnswer({
          status,
          questionId,
          answer,
          sources,
          reasonForRejection,
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
