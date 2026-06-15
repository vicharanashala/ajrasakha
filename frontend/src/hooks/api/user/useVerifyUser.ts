import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import { useToast } from "@/shared/components/toast";

const userService = new UserService();

export const useVerifyUser = () => {
  const queryClient = useQueryClient();
  const {success: toastSuccess, error: toastError } = useToast();
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
      toastSuccess("User verified successfully");
    },
    onError: (error: any) => {
      toastError(error?.message || "Failed to verify user");
    },
  });
};
