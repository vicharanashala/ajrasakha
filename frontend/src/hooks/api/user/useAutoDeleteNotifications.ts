import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "@/hooks/services/userService";

const userService = new UserService();

export const useAutoDeletePreference = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["autoDeleteNotifications"],
    mutationFn: async (
      preference:string
    ): Promise<void | null> => {
        console.log(preference)
      return await userService.notificationDeletePreference(preference)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};