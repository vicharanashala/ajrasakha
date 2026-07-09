import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { GeneratedQuestion } from "../../services/questionService";

const questionService = new QuestionService();

export const useGenerateCallQuestion = () => {
  return useMutation({
    mutationKey: ["generateCallQuestions"],
    mutationFn: async (params: {
      transcript: string;
      state?: string;
      crop?: string;
    }): Promise<GeneratedQuestion[] | null> => {
      return await questionService.generateQuestionsFromCallContext(params.transcript, params.state, params.crop);
    },
  });
};
