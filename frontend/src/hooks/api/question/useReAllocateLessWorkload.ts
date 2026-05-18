import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import {toast} from "sonner";
import type { ReallocateExpertsSelectedQuestionsResponse, WorkloadBalanceResponse } from "@/types";

const questionService = new QuestionService();

export const useReAllocateLessWorkload = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["reallocatelassWorkload"],
    mutationFn: async (type?: string): Promise<WorkloadBalanceResponse|null> => {
     return await questionService.reAllocateLessWorkload(type);
    },
    onSuccess: () => {
      //toast.success("Question ReAllocated Successfully");
      queryClient.invalidateQueries({ queryKey: ["question"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (error: any) => {
      //toast.error("Failed to reAllocate question for those who has less workload");
      console.error("ReAllocate for those who has less workload  question error:", error);
    },
  });
};
export const useReAllocateExpertsSelectedQuestions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["reallocateExpertsSelectedQuestions"],
    mutationFn: async (questionIds: string[]): Promise<ReallocateExpertsSelectedQuestionsResponse|null> => {
     return await questionService.reAllocateExpertsSelectedQuestions(questionIds);
    },
    onSuccess: () => {
      //toast.success("Question ReAllocated Successfully");
      queryClient.invalidateQueries({ queryKey: ["question"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (error: any) => {
      //toast.error("Failed to reAllocate question for those who has less workload");
      console.error("ReAllocate to experts selected questions error:", error);
    },
  });
};
