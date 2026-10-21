import {
  AnswerService,
  type PolishDraftPayload,
  type PolishDraftResponse,
} from "@/hooks/services/answerService";
import { useMutation } from "@tanstack/react-query";

const answerService = new AnswerService();

// Mirrors useFetchAnswer (useGetAiInitialAnswer.ts) exactly - a bare
// mutation, with onSuccess/onError handled by the caller.
export const usePolishDraft = () => {
  return useMutation({
    mutationKey: ["polishDraft"],
    mutationFn: async (
      payload: PolishDraftPayload,
    ): Promise<PolishDraftResponse | null> => {
      return await answerService.getWritingAssistantSuggestions(payload);
    },
  });
};
