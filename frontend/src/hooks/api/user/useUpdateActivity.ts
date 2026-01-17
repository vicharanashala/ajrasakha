import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService"; // Follow useBlockUser pattern
import { toast } from "sonner";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] }); 
      toast.success("Activity status updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update activity status");
    },
  });
};