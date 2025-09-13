import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../services/answerService";

const questionService = new AnswerService();
export const useSubmitAnswer = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { questionId: string; answer: string }>({
    mutationFn: async ({ questionId, answer }) => {
      try {
        return await questionService.submitAnswer(questionId, answer);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question"] });
    },
    onError: (error) => {
      console.error("Failed to submit answer:", error.message);
    },
  });
};
