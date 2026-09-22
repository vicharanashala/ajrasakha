import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrganizationService } from "../../services/organizationService";
import { toast } from "sonner";

export const useUpdateOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const orgService = new OrganizationService();
      return await orgService.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organization updated successfully!");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to update organization");
    },
  });
};
