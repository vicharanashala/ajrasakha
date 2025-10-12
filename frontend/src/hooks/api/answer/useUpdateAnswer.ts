import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../services/answerService";
import toast from "react-hot-toast";
import type { SubmitAnswerResponse } from "@/types";

const answerService = new AnswerService();

export const useUpdateAnswer = () => {
  const queryClient = useQueryClient();

  return useMutation<
    SubmitAnswerResponse | null,
    Error,
    { answerId: string; updatedAnswer: string}
  >({
    mutationFn: async ({ answerId, updatedAnswer }) => {
      try {
        return await answerService.updateAnswer(answerId, updatedAnswer);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
    },
    onError: (error) => {
      console.error("Failed to update answer:", error.message);
    },
  });
};
