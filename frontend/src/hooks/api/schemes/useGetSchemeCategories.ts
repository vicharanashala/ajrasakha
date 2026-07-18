import { useQuery } from "@tanstack/react-query";
import { schemeService } from "@/hooks/services/schemeService";

export const useGetSchemeCategories = () => {
  return useQuery<string[]>({
    queryKey: ["schemes", "categories"],
    queryFn: () => schemeService.getCategories(),
    staleTime: 1000 * 60 * 10,
  });
};
