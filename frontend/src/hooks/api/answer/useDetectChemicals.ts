import { useMutation } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import type { ChemicalDetectionResponse } from "../../services/answerService";

const answerService = new AnswerService();

export const useDetectChemicals = () => {
  return useMutation<ChemicalDetectionResponse | null, Error, string>({
    mutationFn: async (text: string) => {
      return await answerService.detectChemicals(text);
    },
  });
};
