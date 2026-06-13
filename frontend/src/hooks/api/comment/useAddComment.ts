import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CommentService } from "../../services/commentService";
import { toast } from "@/shared/components/toast";

const commentService = new CommentService();

export const useAddComment = () => {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { questionId: string; answerId: string; text: string }
  >({
    mutationFn: async ({ questionId, answerId, text }) => {
      try {
        await commentService.addComment(questionId, answerId, text);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments"] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit response! Try again.");
      console.error("Failed to submit response:", error.message);
    },
  });
};
