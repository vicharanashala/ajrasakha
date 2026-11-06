import { useMutation } from "@tanstack/react-query";
import { anaraService, type AnaraDraftResponse } from "../../services/anaraService";

export const useAnaraDraft = () => {
  return useMutation<AnaraDraftResponse, Error, { question: string; crop?: string | null }>({
    mutationKey: ["anaraDraft"],
    mutationFn: async ({ question, crop }) => {
      return await anaraService.draft(question, crop);
    },
  });
};

