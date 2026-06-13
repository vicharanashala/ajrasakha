import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "@/shared/components/toast";

const questionService = new QuestionService();

export const useManualCheckDuplicate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: ()=>{
      const toastId = toast.loading('checking duplicate...');
      return {toastId}
    },
    mutationKey: ["manualCheckDuplicate"],
    mutationFn: async (questionId: string) => {
      return await questionService.manualCheckDuplicate(questionId);
    },
    onSuccess: (res,__,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
       toast.success(res?.message ?? "Duplicate check complete.");
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
    onError: (_,__,context)=>{
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.error("Duplicate check failed")
    }
  });
};
