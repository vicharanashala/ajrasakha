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

export interface WeatherConcernQueriesResponse {
  questions: {
    questionId?: string;
    messageId?: string;
    userId?: string;
    question: string;
    status: string;
    questionType: "unique" | "duplicate";
    category: string;
    createdAt?: string;
    farmerName?: string;
    name?: string;
    email?: string;
    crop?: string;
    village?: string;
    block?: string;
    district?: string;
    state?: string;
  }[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

const EMPTY_WEATHER_CONCERN_QUERIES_RESPONSE: WeatherConcernQueriesResponse = {
  questions: [],
  total: 0,
  totalPages: 0,
  page: 1,
  limit: 10,
};

export function useWeatherConcernQueries(
  filters: WeatherConcernFilters,
  concern: string | null,
  page: number = 1,
  limit: number = 10,
  source: "vicharanashala" | "annam" = "annam",
  userType: "all" | "external" | "internal" = "all",
  search?: string,
) {
  return useQuery<WeatherConcernQueriesResponse, Error>({
    queryKey: ["weather-concern-queries", filters, concern, page, limit, source, userType, search],
    queryFn: async () => {
      if (!concern) return EMPTY_WEATHER_CONCERN_QUERIES_RESPONSE;

      const params = new URLSearchParams();

      params.set("concern", concern);
      params.set("page", page.toString());
      params.set("limit", limit.toString());

      if (filters.season !== "all") params.set("season", filters.season);
      if (filters.state !== "all") params.set("state", filters.state);
      if (filters.district !== "all") params.set("district", filters.district);
      if (filters.startDate) params.set("startDate", filters.startDate.toISOString());
      if (filters.endDate) params.set("endDate", filters.endDate.toISOString());

      params.set("source", source);
      if (userType !== "all") params.set("userType", userType);
      if (search) params.set("search", search);

      return (
        (await apiFetch<WeatherConcernQueriesResponse>(
          `${env.apiBaseUrl()}/analytics/weather-concern-queries?${params.toString()}`,
        )) ?? EMPTY_WEATHER_CONCERN_QUERIES_RESPONSE
      );
    },
    enabled: !!concern,
  });
}


