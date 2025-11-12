import { useQuery } from "@tanstack/react-query";
import { PerformaneService} from "../../services/performanceService";

import type { WorkLoad} from "@/types";

const performaceService = new PerformaneService();
export const useGetWorkLoad = () => {
  const { data, isLoading, error, refetch } = useQuery<WorkLoad | null, Error>({
    queryKey: ["WorkLoad"],
    queryFn: async () => {
      return await performaceService.getWorkLoadCount();
    },
  });

  return { data, isLoading, error, refetch };
};
