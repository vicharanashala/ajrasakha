import { useMutation } from "@tanstack/react-query";
import { AccAgentService } from "../../services/accAgentService";

const accAgentService = new AccAgentService();

export const useAccAgentResume = () => {
  return useMutation({
    mutationKey: ["accAgentResume"],
    mutationFn: async (threadId: string): Promise<{ final_answer: string }> => {
      try {
        const result = await accAgentService.resumeAndGetAnswer(threadId);
        return result;
      } catch (error) {
        console.error('[useAccAgentResume] Error:', error);
        throw error;
      }
    },
  });
};
