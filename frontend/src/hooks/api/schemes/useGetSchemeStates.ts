import { useQuery } from "@tanstack/react-query";
import { schemeService } from "@/hooks/services/schemeService";

export const useGetSchemeStates = () => {
  return useQuery<string[]>({
    queryKey: ["schemes", "states"],
    queryFn: () => schemeService.getStates(),
    staleTime: 1000 * 60 * 10,
  });
};
