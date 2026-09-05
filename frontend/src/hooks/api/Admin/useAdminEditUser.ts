import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AdminUserService } from "@/hooks/services/adminService";
import type { IUser, IUserAdminEdit } from "@/types";
import { toast } from "@/shared/components/toast";

const adminUserService = new AdminUserService();

export const useAdminEditUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["admin", "edit-user-details"],
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: string;
      data: IUserAdminEdit;
    }): Promise<IUser | null> => {
      return adminUserService.editUserDetails(userId, data);
    },
    onMutate: () =>{
      const toastId = toast.loading('Updating user details...')
      return {toastId}
    },
    onSuccess: (_,__,context) => {
      queryClient.invalidateQueries({
        queryKey: ["admin"],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["users"],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["experts"],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["userReviewLevel"],
        exact: false,
      });
      if(context?.toastId)toast.dismiss(context.toastId)
      toast.success("User details updated successfully!");
    },
    onError: (error: Error,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId)
      toast.error(
        error?.message || "Failed to update user details. Please try again.",
      );
    },
  });
};
