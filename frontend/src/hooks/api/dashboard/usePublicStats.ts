import { useQuery } from "@tanstack/react-query";
import { PublicStatsService } from "@/hooks/services/publicStatsService";

const service = new PublicStatsService();

/** Live public dashboard figures (validated Q&A pairs + states/crops/domains covered). */
export const useGetPublicStats = () =>
  useQuery({
    queryKey: ["public-dashboard-stats"],
    queryFn: () => service.get(),
    staleTime: 5 * 60 * 1000, // aggregate counts don't need to be refetched aggressively
  });
