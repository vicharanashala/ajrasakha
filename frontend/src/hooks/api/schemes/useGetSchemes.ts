import { useQuery } from "@tanstack/react-query";
import { schemeService, type ISchemesPaginatedResponse } from "@/hooks/services/schemeService";

export const useGetSchemes = (params?: {
  category?: string;
  state?: string;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  return useQuery<ISchemesPaginatedResponse>({
    queryKey: ["schemes", params],
    queryFn: () => schemeService.getAll(params),
    staleTime: 1000 * 60 * 5,
  });
};
