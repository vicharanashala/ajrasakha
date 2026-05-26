import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";
import { useQuery } from "@tanstack/react-query";

export interface WeatherConcernFilters {
  season: string;
  state: string;
  district: string;
  startDate?: Date;
  endDate?: Date;
}

export interface WeatherConcernDistributionEntry {
  concern: string;
  count: number;
  percentage: number;
}

export interface WeatherConcernAnalyticsResponse {
  filters: Partial<WeatherConcernFilters>;
  summary: {
    totalWeatherQueries: number;
    topConcern: string | null;
  };
  concernDistribution: WeatherConcernDistributionEntry[];
  timeline: Array<{
    month: string;
    count: number;
  }>;
}

export const DEFAULT_WEATHER_CONCERN_FILTERS: WeatherConcernFilters = {
  season: "all",
  state: "all",
  district: "all",
  startDate: undefined,
  endDate: undefined,
};

const EMPTY_WEATHER_CONCERN_RESPONSE: WeatherConcernAnalyticsResponse = {
  filters: {},
  summary: {
    totalWeatherQueries: 0,
    topConcern: null,
  },
  concernDistribution: [],
  timeline: [],
};

export function useWeatherConcernAnalytics(
  filters: WeatherConcernFilters,
  source: "vicharanashala" | "annam" = "annam",
  userType: "all" | "external" | "internal" = "all",
) {
  return useQuery<WeatherConcernAnalyticsResponse, Error>({
    queryKey: ["weather-concern-analytics", filters, source, userType],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.season !== "all") params.set("season", filters.season);
      if (filters.state !== "all") params.set("state", filters.state);
      if (filters.district !== "all") params.set("district", filters.district);
      if (filters.startDate) params.set("startDate", filters.startDate.toISOString());
      if (filters.endDate) params.set("endDate", filters.endDate.toISOString());

      params.set("source", source);
      if (userType !== "all") params.set("userType", userType);

      return (
        (await apiFetch<WeatherConcernAnalyticsResponse>(
        `${env.apiBaseUrl()}/analytics/weather-concerns?${params.toString()}`,
        )) ?? EMPTY_WEATHER_CONCERN_RESPONSE
      );
    },
  });
}
