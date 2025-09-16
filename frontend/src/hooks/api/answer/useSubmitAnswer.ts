import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../services/answerService";
import toast from "react-hot-toast";
import type { SubmitAnswerResponse } from "@/types";

const questionService = new AnswerService();
export const useSubmitAnswer = () => {
  const queryClient = useQueryClient();
  return useMutation<
    SubmitAnswerResponse | null,
    Error,
    { questionId: string; answer: string }
  >({
    mutationFn: async ({ questionId, answer }) => {
      try {
        return await questionService.submitAnswer(questionId, answer);
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
