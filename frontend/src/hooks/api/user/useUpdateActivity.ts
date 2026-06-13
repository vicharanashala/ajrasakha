import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService"; // Follow useBlockUser pattern

const userService = new UserService();

export const useUpdateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['update_activity'],
    mutationFn: async ({ userId, status }: { userId: string, status: 'active' | 'in-active' }) => {
      const result = await userService.updateUserStatus(userId, status);
      if (status === 'in-active') {
        await userService.isBlockUser(userId, 'block');
      }
      if (status === 'active') {
        await userService.isBlockUser(userId, 'unblock');
      }
      
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["experts"] }); 
      // toast.success("Activity status updated successfully");
    },
  });
};