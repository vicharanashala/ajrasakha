import { useMutation, useQueryClient } from "@tanstack/react-query";
import {toast} from "sonner";
import { CommentService } from "../../services/commentService";

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
