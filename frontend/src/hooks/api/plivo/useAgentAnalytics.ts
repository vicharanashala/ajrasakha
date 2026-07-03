import { useQuery } from "@tanstack/react-query";
import { plivoService, type AgentAnalytics } from "./api";

interface UseAgentAnalyticsParams {
  startDate?: string;
  endDate?: string;
  enabled?: boolean;
}

export const useAgentAnalytics = ({
  startDate,
  endDate,
  enabled = true,
}: UseAgentAnalyticsParams = {}) => {
  const { data, isLoading, error, refetch } = useQuery<AgentAnalytics>({
    queryKey: ["agent-analytics", startDate, endDate],
    queryFn: () => plivoService.getAgentAnalytics({ startDate, endDate }),
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
