import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService";

const userService = new UserService();

export const useVerifyUserAnalytics = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["verify_user_analytics"],
    mutationFn: async ({
      userId,
      source,
    }: {
      userId: string;
      source: string;
    }) => {
      return await userService.verifyUserInAnalytics(userId, source);
    },
    onSuccess: () => {
      // Refresh unverified users list
      queryClient.invalidateQueries({
        queryKey: ["unverified_users"],
        exact: false,
      });

      // Refresh admin users list
      queryClient.invalidateQueries({
        queryKey: ["admin"],
        exact: false,
      });
    },
  });
};
