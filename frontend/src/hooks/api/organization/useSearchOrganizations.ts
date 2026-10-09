import { useQuery } from "@tanstack/react-query";
import { OrganizationService } from "../../services/organizationService";
import type { Organization } from "@/types";

const organizationService = new OrganizationService();

export const useSearchOrganizations = (
  search: string,
  enabled = true,
  type?: NonNullable<Organization["type"]>,
) => {
  return useQuery({
    queryKey: ["organizations", "search", search, type],
    queryFn: () => organizationService.search(search, 1, 20, type),
    enabled,
  });
};
