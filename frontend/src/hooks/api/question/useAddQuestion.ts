import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";
import type { IDetailedQuestion } from "@/types";

const questionService = new QuestionService();

export const useAddQuestion = (onUploaded?: (count: number) => void) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["addQuestion"],
    mutationFn: async (
      newQuestionData: Partial<IDetailedQuestion> | FormData
    ) => {
      // return await questionService.addQuestion(newQuestionData);
      if (newQuestionData instanceof FormData) {
        return await questionService.addQuestion(newQuestionData, true);
      }
      return await questionService.addQuestion(newQuestionData);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
      if (data?.insertedIds?.length) {
        onUploaded?.(data.insertedIds.length);
      }
      if (data?.message) {
        toast.success(data.message);
      } else {
        toast.success("Question added successfully!");
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to add question");
      console.error("Add question error:", error);
    },
  });
};
