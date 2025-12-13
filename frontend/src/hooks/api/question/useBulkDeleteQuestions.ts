import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";

const questionService = new QuestionService();

export const useBulkDeleteQuestions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["bulkDeleteQuestions"],
    mutationFn: async (
      questionIds: string[]
    ): Promise<{ deletedCount: number } | null> => {
      return questionService.bulkDeleteQuestions(questionIds);
    },
    onSuccess: (data) => {
      if (data)
        toast.success(`${data.deletedCount} question(s) deleted successfully`);
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
    onError: (error: any) => {
      toast.error("Failed to delete questions");
    },
  });
};
