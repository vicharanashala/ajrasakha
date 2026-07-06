import { useMutation } from "@tanstack/react-query";
import { AccAgentService } from "../../services/accAgentService";

const accAgentService = new AccAgentService();

export const useAccAgentThread = () => {
  return useMutation({
    mutationKey: ["accAgentThread"],
    mutationFn: async () => {
      try {
        const result = await accAgentService.createThread();
        return result;
      } catch (error) {
        console.error('[useAccAgentThread] Error:', error);
        throw error;
      }
    },
  });
};
