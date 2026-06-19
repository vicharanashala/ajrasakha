import { useMutation } from "@tanstack/react-query";
import { AccAgentService, type QAMetadata } from "../../services/accAgentService";

const accAgentService = new AccAgentService();

export const useAccAgentResume = () => {
  return useMutation({
    mutationKey: ["accAgentResume"],
    mutationFn: async (params: { threadId: string; callUuid?: string; metadata?: QAMetadata }): Promise<{ final_answer: string }> => {
      try {
        const result = await accAgentService.resumeAndGetAnswer(params.threadId, params.callUuid, params.metadata);
        return result;
      } catch (error) {
        console.error('[useAccAgentResume] Error:', error);
        throw error;
      }
    },
  });
};
