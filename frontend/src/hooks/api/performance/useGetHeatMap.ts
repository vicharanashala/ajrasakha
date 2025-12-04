import { useQuery } from "@tanstack/react-query";
import { PerformaneService } from "../../services/performanceService";

import type { HeatMapResult } from "@/types";
import type { DateRange } from "@/components/dashboard/questions-analytics";

const performaceService = new PerformaneService();
export const useGetHeapMap = ({ startTime, endTime }: DateRange) => {
  const { data, isLoading, error, refetch } = useQuery<
    HeatMapResult[] | null,
    Error
  >({
    queryKey: ["Heatmap", startTime, endTime],
    queryFn: async () => {
      return await performaceService.getheatMapOfReviewers({
        startTime,
        endTime,
      });
    },
  });

  return { data, isLoading, error, refetch };
};
