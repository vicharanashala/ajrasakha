import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";
import { useQuery } from "@tanstack/react-query";

interface DistrictAnalyticsEntry {
  district: string;
  totalQuestions: number;
  closedQuestions: number;
  uniqueQuestions: number;
  duplicateQuestions: number;
  totalUsers: number;
  activeUsers: number;
  coordinators: number;
}

export interface DistrictAnalyticsResponse {
  state: string;
  totalDistricts: number;

  data: DistrictAnalyticsEntry[];
}

export function useStateWiseAnalytics(
  state?: string,
  selectedStateCode: number,
  source: "vicharanashala" | "annam" | "whatsapp"= "annam",
  userType: "all" | "external" | "internal" = "all",
  /** Authenticated endpoint — pass false on the public dashboard so it never fires. */
  enabled: boolean = true,
) {
  const { data, isLoading,  isFetching, error } = useQuery<
    DistrictAnalyticsResponse,
    Error
  >({
    queryKey: [
      "state-wise-analytics",
      state,
      selectedStateCode,
      source,
      userType,
    ],

    enabled: !!state && enabled,

    placeholderData: (prev) => prev,

    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();

      const params = new URLSearchParams();

      if (state) {
        params.set("state", state);
      }

      if(selectedStateCode){
        params.set("selectedStateCode", selectedStateCode.toString())
      }

      params.set("source", source);
      if (userType !== "all") {
        params.set("userType", userType);
      }

      const queryString = params.toString();

      const result =
        await apiFetch<DistrictAnalyticsResponse>(
          `${API_BASE_URL}/analytics/state-wise-analytics?${
            queryString
          }`,
        );

      return result;
    },
  });

  return {
    data,
    isLoading,
    isFetching,
    error: error ?? null,
  };
}