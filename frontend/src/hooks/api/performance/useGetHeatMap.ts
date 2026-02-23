import { useQuery } from "@tanstack/react-query";
import { PerformaneService } from "../../services/performanceService";

import type { HeatmapResponse } from "@/types";
import type { DateRange } from "@/components/dashboard/questions-analytics";

const performaceService = new PerformaneService();
export const useGetHeapMap = ({ startTime, endTime, page=1,limit=10 }: DateRange & {page?:number,limit?:number}) => {
  const { data, isLoading, error, refetch } = useQuery<
    HeatmapResponse | null,
    Error
  >({
    queryKey: ["Heatmap", startTime, endTime,page,limit],
    queryFn: async () => {
      return await performaceService.getheatMapOfReviewers({
        startTime,
        endTime,
        page,
        limit,
      });
    },
  });

  return { data, isLoading, error, refetch };
};
