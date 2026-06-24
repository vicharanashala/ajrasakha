import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";

const questionService = new QuestionService();

export const useManualReallocate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["manualReallocate"],
    mutationFn: (body: { 
      assignments: { submissionId: string; expertId: string }[];
      inactiveExpertIds?: string[];
    }) => questionService.manualReallocate(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["question"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to reallocate questions");
    },
  });
};
