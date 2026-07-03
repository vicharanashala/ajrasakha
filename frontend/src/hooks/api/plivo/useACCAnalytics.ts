import { useQuery } from "@tanstack/react-query";
import { plivoService, type ACCAnalytics } from "./api";

interface UseACCAnalyticsParams {
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
}

export const useACCAnalytics = ({
  startDate,
  endDate,
  enabled = true,
}: UseACCAnalyticsParams = {}) => {
  const { data, isLoading, error, refetch } = useQuery<ACCAnalytics>({
    queryKey: ["acc-analytics", startDate, endDate],
    queryFn: () => plivoService.getACCAnalytics({ startDate, endDate }),
    enabled,
    refetchOnWindowFocus: false,
  });

  return {
    data,
    isLoading,
    error,
    refetch,
  };
};
