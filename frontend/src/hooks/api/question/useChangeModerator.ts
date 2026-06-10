import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";

const questionService = new QuestionService();

export const useChangeModerator = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["change_moderator"],
        mutationFn: async ({ questionId, moderatorId }: { questionId: string; moderatorId: string }) => {
            return await questionService.changeModerator(questionId, moderatorId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
            toast.success("Moderator updated successfully");
        },
        onError: (error: any) => {
            toast.error(error?.message || "Failed to update moderator");
        },
    });
};
