import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserService } from "../../services/userService"; // Follow useBlockUser pattern
import { toast } from "@/shared/components/toast";


const userService = new UserService();

export const useUpdateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['update_activity'],
    mutationFn: async ({ userId, status }: { userId: string, status: 'active' | 'in-active' }) => {
      const result = await userService.updateUserStatus(userId, status);
      // if (status === 'in-active') {
      //   await userService.isBlockUser(userId, 'block');
      // }
      // if (status === 'active') {
      //   await userService.isBlockUser(userId, 'unblock');
      // }
      
      return result;
    },
     onMutate: () => {
      return {
        toastId: toast.loading("Updating Activity Status..."),
      };
    },
    onSuccess: async (_, __, context) => {
      await queryClient.invalidateQueries({ queryKey: ["admin"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["users"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["experts"], exact: false }); 
      await queryClient.invalidateQueries({ queryKey: ["user"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["user-profile"], exact: false });
      toast.dismiss(context?.toastId);
      toast.success("Activity status updated successfully");
    },
    onError: (error, _, context) => {
      toast.dismiss(context?.toastId);
      toast.error(error?.message || "Failed to update activity status");
    },
  });
};
