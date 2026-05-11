import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import { toast } from "sonner";

const userService = new UserService();

export const useVerifyUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["verify_user"],
    mutationFn: async ({ userId, isVerified }: { userId: string; isVerified: boolean }) => {
      return await userService.verifyUser(userId, isVerified);
    },
    onSuccess: () => {
      // Refresh admin users list
      queryClient.invalidateQueries({
        queryKey: ["users"],
        exact: false,
      });

      // Refresh moderator experts list
      queryClient.invalidateQueries({
        queryKey: ["experts"],
        exact: false,
      });

      // Refresh admin table users list
      queryClient.invalidateQueries({
        queryKey: ["admin"],
        exact: false,
      });
      toast.success("User verified successfully");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to verify user");
    },
  });
};
