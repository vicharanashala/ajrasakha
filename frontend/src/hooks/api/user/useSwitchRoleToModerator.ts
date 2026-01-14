import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import { toast } from "sonner";

const userService = new UserService();

export const useSwitchRoleToModerator = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["switch_role_moderator"],
    mutationFn: async (userId: string) => {
      return await userService.switchRoleToModerator(userId);
    },
    onSuccess: (updatedUser) => {

      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`Role switched successfully for ${updatedUser.user.firstName}`);
    },
    onError: () => {
      toast.error("Failed to switch role to moderator");
    },
  });
};