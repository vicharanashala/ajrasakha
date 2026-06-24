import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";

const questionService = new QuestionService();

export const useRemoveModerator = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["remove_moderator"],
        mutationFn: async ({ questionId }: { questionId: string }) => {
            return await questionService.removeModerator(questionId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
            toast.success("Moderator removed successfully");
        },
        onError: (error: any) => {
            toast.error(error?.message || "Failed to remove moderator");
        },
    });
};
