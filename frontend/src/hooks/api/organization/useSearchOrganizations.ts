import { useQuery } from "@tanstack/react-query";
import { OrganizationService } from "../../services/organizationService";

const organizationService = new OrganizationService();

export const useSearchOrganizations = (search: string, enabled = true) => {
  return useQuery({
    queryKey: ["organizations", "search", search],
    queryFn: () => organizationService.search(search),
    enabled,
  });
};
