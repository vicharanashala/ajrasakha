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
      isVerified = true,
    }: {
      userId: string;
      source: string;
      isVerified?: boolean;
    }) => {
      return await userService.verifyUserInAnalytics(userId, source, isVerified);
    },
    onSuccess: () => {
      // Refresh unverified users list
      queryClient.invalidateQueries({
        queryKey: ["user-details"],
        exact: false,
      });
    },
  });
};
