import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrganizationService } from "../../services/organizationService";
import { toast } from "sonner";

export const useDeleteOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const orgService = new OrganizationService();
      return await orgService.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organization deleted successfully!");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to delete organization");
    },
  });
};
