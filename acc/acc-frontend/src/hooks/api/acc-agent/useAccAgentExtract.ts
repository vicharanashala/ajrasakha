import { useMutation } from "@tanstack/react-query";
import { AccAgentService, type ExtractDataResponse } from "../../services/accAgentService";

const accAgentService = new AccAgentService();

export const useAccAgentExtract = () => {
  return useMutation({
    mutationKey: ["accAgentExtract"],
    mutationFn: async (params: { threadId: string; transcript: string; extractionType?: 'farmer_details' | 'query_details' }): Promise<ExtractDataResponse> => {
      try {
        const result = await accAgentService.extractData(params.threadId, params.transcript, params.extractionType);
        return result;
      } catch (error) {
        console.error('[useAccAgentExtract] Error:', error);
        throw error;
      }
    },
  });
};
