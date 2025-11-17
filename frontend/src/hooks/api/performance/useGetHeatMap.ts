import { useQuery } from "@tanstack/react-query";
import { PerformaneService} from "../../services/performanceService";

import type { HeatMapResult} from "@/types";

const performaceService = new PerformaneService();
export const useGetHeapMap = () => {
  const { data, isLoading, error, refetch } = useQuery<HeatMapResult[] | null, Error>({
    queryKey: ["Heatmap"],
    queryFn: async () => {
      return await performaceService.getheatMapOfReviewers();
    },
  });

  return { data, isLoading, error, refetch };
};
