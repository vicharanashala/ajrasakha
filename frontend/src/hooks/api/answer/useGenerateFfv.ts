import { useMutation } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import { toast } from "sonner";

export interface GenerateFfvPayload {
  question: string;
  answer: string;
  domains?: string[];
}

export interface GenerateFfvVersion {
  angle: string;
  question: string;
  answer: string;
}

export interface GenerateFfvResponse {
  results: Array<{
    domain: string;
    versions: GenerateFfvVersion[];
  }>;
  total_versions: number;
}

const answerService = new AnswerService();

export const useGenerateFfv = () => {
  return useMutation<GenerateFfvResponse, Error, GenerateFfvPayload>({
    mutationFn: async (payload) => {
      const result = await answerService.generateFfv(payload);
      if (!result) {
        throw new Error("Failed to generate farmer-friendly versions. Please try again.");
      }
      return result;
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate FFVs. Please try again.");
      console.error("[useGenerateFfv] Error:", error.message);
    },
  });
};