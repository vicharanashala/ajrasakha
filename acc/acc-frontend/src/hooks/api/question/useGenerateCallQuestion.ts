import { useMutation } from "@tanstack/react-query";
import { AccAgentService, type GeneratedQuestion } from "../../services/accAgentService";

const accAgentService = new AccAgentService();

export const useGenerateCallQuestion = () => {
  return useMutation({
    mutationKey: ["generateCallQuestions"],
    mutationFn: async (params: {
      transcript: string;
      state?: string;
      crop?: string;
      district?: string;
      domain?: string | string[];
      season?: string;
    }): Promise<GeneratedQuestion[] | null> => {
      return await accAgentService.generateQuestionsFromCallContext(
        params.transcript,
        params.state,
        params.crop,
        params.district,
        params.domain,
        params.season
      );
    },
  });
};
