import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export const useGenerateInitialAnswer = () => {
  return useMutation({
    mutationFn: async (questionId: string) => {
      if (!questionId) throw new Error("Question ID is required");
      return await questionService.generateAIInitialAnswer(questionId);
    },
  });
};