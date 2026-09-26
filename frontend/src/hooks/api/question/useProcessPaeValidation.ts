import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export interface ProcessPaeValidationPayload {
  questionId: string;
  status: "approve" | "feedback";
  suggestionComment?: string;
  suggestionLink?: string;
  suggestionSourceName?: string;
  answerId?: string;
}

export interface ProcessPaeValidationResponse {
  success: boolean;
  message: string;
}

export const useProcessPaeValidation = () => {
  const mutation = useMutation<
    ProcessPaeValidationResponse,
    Error,
    ProcessPaeValidationPayload
  >({
    mutationFn: async (payload: ProcessPaeValidationPayload) => {
      const response = await questionService.processPaeValidation(payload);
      if (!response) {
        throw new Error("Failed to process PAE validation");
      }
      return response;
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
};