import { useQuery } from "@tanstack/react-query";
import { PublicStatsService } from "@/hooks/services/publicStatsService";

const service = new PublicStatsService();

/**
 * Full public dashboard figures, including the coverage breakdowns (states / crops /
 * domains). This is the heavy call — its aggregation doesn't need frequent refresh, so it
 * stays lazy. The fast-moving counts are polled separately via useGetPublicCounts().
 */
export const useGetPublicStats = () =>
  useQuery({
    queryKey: ["public-dashboard-stats"],
    queryFn: () => service.get(),
    staleTime: 5 * 60 * 1000, // coverage breakdowns don't need to be refetched aggressively
  });

/** Query key for the headline counts — shared with the WebSocket that pushes updates. */
export const PUBLIC_COUNTS_KEY = ["public-dashboard-counts"];

/**
 * The four headline counts. This does ONE fetch for the initial paint (and a fallback if
 * the socket never connects); after that the values are pushed by usePublicCountsSocket(),
 * which writes straight into this query's cache. No polling — updates are event-driven off
 * a MongoDB change stream on the backend.
 */
export const useGetPublicCounts = () =>
  useQuery({
    queryKey: PUBLIC_COUNTS_KEY,
    queryFn: () => service.getCounts(),
    staleTime: Infinity, // kept fresh by the socket, not by refetching
  });
