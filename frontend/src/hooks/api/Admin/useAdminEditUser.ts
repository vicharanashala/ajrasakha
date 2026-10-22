import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminUserService } from "@/hooks/services/adminService";
import type { IUser, IUserAdminEdit } from "@/types";

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
    onSuccess: () => {
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
      toast.success("User details updated successfully!");
    },
    onError: (error: Error) => {
      toast.error(
        error?.message || "Failed to update user details. Please try again.",
      );
    },
  });
};
