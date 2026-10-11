import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { GeneratedQuestion } from "@/components/voice-recorder-card";

const questionService = new QuestionService();

export const useGenerateQuestion = () => {
  return useMutation({
    mutationKey: ["generateQuestions"],
    mutationFn: async (
      payload: string | { transcript: string; language?: string }
    ): Promise<GeneratedQuestion[] | null> => {
      if (typeof payload === "string") {
        return await questionService.generateQuestions(payload);
      }
      return await questionService.generateQuestions(payload.transcript, payload.language);
    },
  });
};
