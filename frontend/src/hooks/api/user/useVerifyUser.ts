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

      // The legacy /users/:id/verify endpoint and the analytics
      // /analytics/verify-user/:userId endpoint both update the same user
      // record, so the analytics user-details table must be invalidated here
      // as well — otherwise a verify/unverify from the admin user-table leaves
      // the dashboard table stale until a manual page refresh.
      queryClient.invalidateQueries({
        queryKey: ["user-details"],
        exact: false,
        refetchType: "all",
      });
      toast.success("User verified successfully");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to verify user");
    },
  });
};
