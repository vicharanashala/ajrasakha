import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { GeneratedQuestion } from "@/components/voice-recorder-card";

const questionService = new QuestionService();

export const useGenerateCallQuestion = () => {
  return useMutation({
    mutationKey: ["generateCallQuestions"],
    mutationFn: async (
      transcript: string
    ): Promise<GeneratedQuestion[] | null> => {
      return await questionService.generateQuestionsFromCallContext(transcript);
    },
  });
};
