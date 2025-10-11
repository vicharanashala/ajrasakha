import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";
import toast from "react-hot-toast";

const questionService = new QuestionService();

export const useDeleteQuestion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["deleteQuestion"],
    mutationFn: async (questionId: string): Promise<void> => {
      await questionService.deleteQuestion(questionId);
    },
    onSuccess: () => {
      toast.success("Question deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
    onError: (error: any) => {
      toast.error("Failed to delete question");
      console.error("Delete question error:", error);
    },
  });
};
