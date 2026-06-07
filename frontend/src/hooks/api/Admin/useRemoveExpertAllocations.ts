import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminUserService } from "@/hooks/services/adminService";

const adminUserService = new AdminUserService();

export const useRemoveExpertAllocations = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["admin", "remove-expert-allocations"],
    mutationFn: async (expertId: string) => {
      return adminUserService.removeExpertAllocations(expertId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin"],
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
      queryClient.invalidateQueries({
        queryKey: ["dashboard", "expert-performance"],
      });
    },
  });
};
