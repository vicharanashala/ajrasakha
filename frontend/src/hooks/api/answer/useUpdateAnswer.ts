import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import type { SourceItem, SubmitAnswerResponse } from "@/types";

const answerService = new AnswerService();

export const useUpdateAnswer = () => {
  const queryClient = useQueryClient();

  return useMutation<
    SubmitAnswerResponse | null,
    Error,
    { answerId?: string; updatedAnswer: string; sources: SourceItem[]; source?: string; questionId?: string;}
  >({
    mutationFn: async ({ answerId, updatedAnswer, sources, source, questionId  }) => {
      try {
        return await answerService.updateAnswer(answerId, updatedAnswer, sources, source, questionId );
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
