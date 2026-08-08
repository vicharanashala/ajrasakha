import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";

const answerService = new AnswerService();

interface PaeActionPayload {
  questionId: string;
  action: 'accept' | 'reroute_experts' | 'reroute_pae';
  answerId?: string;
  comment?: string;
  paeExpertId?: string;
}

export const usePaeModeratorAction = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { message: string },
    Error,
    PaeActionPayload
  >({
    mutationFn: async (payload) => {
      try {
        // @ts-ignore
        return await answerService.paeModeratorAction(payload);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
    },
    onError: (error) => {
      console.error("PAE moderator action failed:", error.message);
    },
  });
};
