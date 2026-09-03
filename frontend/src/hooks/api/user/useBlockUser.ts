import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import { toast } from "@/shared/components/toast";

const userService = new UserService();

export const useBlockUser = () => {
  const queryClient =useQueryClient();
  return useMutation({
    mutationKey:['block_user'],
    mutationFn: async ({userId,action}: {userId:string,action:string}) => {
     return await userService.isBlockUser(userId,action)
    },
    onSuccess: async () => {
      // Refresh admin users list
      await queryClient.invalidateQueries({
        queryKey: ["admin"],
        exact: false,
      });

      // Refresh non-admin users list
      await queryClient.invalidateQueries({
        queryKey: ["users"],
        exact: false,
      });

      // Refresh moderator experts list
      await queryClient.invalidateQueries({
        queryKey: ["experts"],
        exact: false,
      });

      // Refresh current user data
      await queryClient.invalidateQueries({
        queryKey: ["user"],
        exact: false,
      });

      // Refresh user profile
      await queryClient.invalidateQueries({
        queryKey: ["user-profile"],
        exact: false,
      });

      // Refresh user review level / performance
      await queryClient.invalidateQueries({
        queryKey: ["userReviewLevel"],
        exact: false,
      });

      toast.success("User updated successfully");
    },
    onError: (error: any) => {
      console.error("Error blocking/unblocking user:", error);
      toast.error(error?.message || `Failed to block or unblock user`);
    },
  });
};
