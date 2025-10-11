import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";
import type { IDetailedQuestion } from "@/types";

const questionService = new QuestionService();

export const useUpdateQuestion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["updateQuestion"],
    mutationFn: async (
      question: IDetailedQuestion
    ): Promise<IDetailedQuestion | null> => {
      return await questionService.updateQuestion(question._id!, question);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
  });
};
