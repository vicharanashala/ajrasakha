import { useQuery } from "@tanstack/react-query";
import { OrganizationService } from "../../services/organizationService";

export const useGetOrganizations = (search: string, page: number, limit: number) => {
  return useQuery({
    queryKey: ["organizations", search, page, limit],
    queryFn: async () => {
      const orgService = new OrganizationService();
      return await orgService.search(search, page, limit);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
};
