import {
  AnswerService,
  type IFetchAnswerPayload,
} from "@/hooks/services/answerService";
import { useMutation } from "@tanstack/react-query";
const answerService = new AnswerService();
export const useFetchAnswer = () => {
  return useMutation({
    mutationKey: ["fetchAnswer"],
    mutationFn: async (payload: IFetchAnswerPayload): Promise<any | null> => {
      return await answerService.fetchAiInitialAnswer(payload);
    },
  });
};
