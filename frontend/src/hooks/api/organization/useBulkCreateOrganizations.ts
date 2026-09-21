import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrganizationService } from "../../services/organizationService";
import type {
  Organization,
  OrganizationBulkResponse,
  OrganizationBulkRow,
} from "@/types";

export const useBulkCreateOrganizations = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["bulkCreateOrganizations"],
    mutationFn: async ({
      type,
      rows,
    }: {
      type: NonNullable<Organization["type"]>;
      rows: OrganizationBulkRow[];
    }): Promise<OrganizationBulkResponse | null> => {
      const orgService = new OrganizationService();
      return await orgService.bulkCreate(type, rows);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
};
