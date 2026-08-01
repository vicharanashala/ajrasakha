import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import { toast } from "sonner";

const userService = new UserService();

export const useToggleTrainingUserStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ['toggle_training_user'],
        mutationFn: async ({ userId, action }: { userId: string; action: string }) => {
            return await userService.toggleTrainingUserStatus(userId, action);
        },
        onSuccess: (_, { action }) => {
            queryClient.invalidateQueries({
                queryKey: ["users"],
                exact: false,
            });
            queryClient.invalidateQueries({
                queryKey: ["experts"],
                exact: false,
            });
            queryClient.invalidateQueries({
                queryKey: ["admin"],
                exact: false,
            });
            toast.success(action === 'assign' ? "Training user status assigned successfully" : "Training user status removed successfully");
        },
        onError: (error: any) => {
            toast.error(error?.message || "Failed to update training user status");
        },
    });
};