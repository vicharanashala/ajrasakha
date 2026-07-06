import { useMutation } from "@tanstack/react-query";
import { AccAgentService, type CorrectedData } from "../../services/accAgentService";

const accAgentService = new AccAgentService();

export const useAccAgentUpdateState = () => {
  return useMutation({
    mutationKey: ["accAgentUpdateState"],
    mutationFn: async (params: { threadId: string; correctedData: CorrectedData }): Promise<void> => {
      try {
        await accAgentService.updateState(params.threadId, params.correctedData);
      } catch (error) {
        console.error('[useAccAgentUpdateState] Error:', error);
        throw error;
      }
    },
  });
};
