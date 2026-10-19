import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrganizationService } from "../../services/organizationService";
import { toast } from "sonner";

export const useCreateOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const orgService = new OrganizationService();
      return await orgService.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organization added successfully!");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to add organization");
    },
  });
};
