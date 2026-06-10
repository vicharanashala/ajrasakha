import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEYS, REFRESH_DELAY_MS } from "../utils/constants";

/**
 * Hook for managing dashboard refresh functionality
 */
export function useDashboardRefresh() {
  const [invalidating, setInvalidating] = useState(false);
  const queryClient = useQueryClient();

  const handleRefreshAll = useCallback(async () => {
    setInvalidating(true);
    
    // Invalidate all dashboard queries
    // This marks them as stale and triggers background refetch
    // Data stays visible during refetch (unlike refetchQueries which blocks until complete)
    DASHBOARD_QUERY_KEYS.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });

    // Give a short delay to show the refreshing state
    setTimeout(() => setInvalidating(false), REFRESH_DELAY_MS);
  }, [queryClient]);

  const refetchSpecific = useCallback(
    async (queryKey: string[]) => {
      await queryClient.refetchQueries({ queryKey: queryKey });
    },
    [queryClient]
  );

  return {
    invalidating,
    handleRefreshAll,
    refetchSpecific,
  };
}

/**
 * Hook for managing knowledge & awareness data refresh
 */
export function useKnowledgeAwarenessRefresh(queryClient: ReturnType<typeof useQueryClient>) {
  const [kwDataRefreshing, setKWDataRefreshing] = useState(false);

  const handleKWRefresh = useCallback(async () => {
    setKWDataRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["user-metrices"] });
    setKWDataRefreshing(false);
  }, [queryClient]);

  return {
    kwDataRefreshing,
    handleKWRefresh,
  };
}