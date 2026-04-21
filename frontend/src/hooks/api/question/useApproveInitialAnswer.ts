import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export const useApproveAIAnswer = () => {
  return useMutation({
    mutationFn: async ({
      questionId,
      answer,
    }: {
      questionId: string;
      answer: string;
    }) => {
      return await questionService.approveAIInitialAnswer(
        questionId,
        answer
      );
    },
  });
};