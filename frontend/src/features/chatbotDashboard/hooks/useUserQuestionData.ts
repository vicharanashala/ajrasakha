import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";

export interface UserQuestion {
  question: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  repeatedCount: number;
  isDuplicate: boolean;
}

export interface UserMessage {
  message: string;
  messageId?: string;
  createdAt: string;
  updatedAt: string;
  repeatedCount: number;
  isDuplicate: boolean;
}

export interface PaginatedResponse<T> {
  total: number;
  totalPages: number;
  currentPage: number;
  limit: number;
  items: T[];
}

export interface UserActivityResponse {
  questions: PaginatedResponse<UserQuestion>;

  messages: PaginatedResponse<UserMessage>;
}

const emptyUserActivityResponse = (
  page: number,
  limit: number,
): UserActivityResponse => ({
  questions: {
    total: 0,
    totalPages: 1,
    currentPage: page,
    limit,
    items: [],
  },
  messages: {
    total: 0,
    totalPages: 1,
    currentPage: page,
    limit,
    items: [],
  },
});

export function useUserQuestionsData(
  userEmail: string,
  source: string,
  userType: string,
  page = 1,
  limit = 10,
  userId = '',
) {
  const { data, isLoading, error } = useQuery<UserActivityResponse, Error>({
    queryKey: ["user-questions-data", userEmail, userId, source, userType, page, limit],

    enabled: !!userEmail || !!userId,

    staleTime: 30 * 1000,

    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();

      const params = new URLSearchParams();

      if (userEmail) params.set("userEmail", userEmail);
      if (userId) params.set("userId", userId);
      params.set("source", source);
      params.set("userType", userType);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const result = await apiFetch<UserActivityResponse>(
        `${API_BASE_URL}/analytics/user-questions-data?${params.toString()}`,
      );

      return result ?? emptyUserActivityResponse(page, limit);
    },
  });

  return {
    data: data ?? emptyUserActivityResponse(page, limit),

    isLoading,

    error,
  };
}
