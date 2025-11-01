import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import toast from "react-hot-toast";
import type { IDetailedQuestion } from "@/types";

const questionService = new QuestionService();

export const useAddQuestion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["addQuestion"],
    mutationFn: async (newQuestionData: Partial<IDetailedQuestion> | FormData) => {
      // return await questionService.addQuestion(newQuestionData);
      if(newQuestionData instanceof FormData){
        return await questionService.addQuestion(newQuestionData,true)
      }
      return await questionService.addQuestion(newQuestionData)
    },
    onSuccess: (data:any) => {
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
      if (data?.message) {
        toast.success(data.message);
      } else {
        toast.success("Question added successfully!");
      }

    },
    onError: (error: any) => {
      toast.error("Failed to add question");
      console.error("Add question error:", error);
    },
  });
};
