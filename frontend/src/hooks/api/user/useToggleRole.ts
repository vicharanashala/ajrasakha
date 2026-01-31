import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import { toast } from "sonner";

const userService = new UserService();

export const useToggleRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["toggle_user_role"],

    mutationFn: async ({
      userId,
      currentUserRole,
    }: {
      userId: string;
      currentUserRole: string;
    }) => {
      return userService.toggleUserRole(userId, currentUserRole);
    },

    onSuccess: (updatedUser:any) => {
      queryClient.invalidateQueries({queryKey:['users']})
      queryClient.invalidateQueries({queryKey:['experts']})
      toast.success(
        `Role of user ${updatedUser?.user?.firstName} switched successfully to ${updatedUser?.user?.role}`,
      );
    },

    onError: () => {
      toast.error("Failed to switch role");
    },
  });
};

