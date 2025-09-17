import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";
import type { GeneratedQuestion } from "@/components/voice-recorder-card";

const questionService = new QuestionService();

export const useGenerateQuestion = () => {
  return useMutation({
    mutationKey: ["generateQuestions"],
    mutationFn: async (
      transcript: string
    ): Promise<GeneratedQuestion[] | null> => {
      return await questionService.generateQuestions(transcript);
    },
  });
};
