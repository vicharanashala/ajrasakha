import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";

const userService = new UserService();

export const useToggleSTF = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ['toggle_stf'],
        mutationFn: async ({ userId, action }: { userId: string; action: string }) => {
            return await userService.toggleSTF(userId, action);
        },
        onSuccess: () => {
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
        },
    });
};