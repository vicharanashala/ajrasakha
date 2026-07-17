import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";

export interface UserQuestion {
  _id?: string;
  question: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  repeatedCount: number;
  isDuplicate: boolean;
}

export interface UserMessage {
  message: string;
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

export function useUserQuestionsData(
  userEmail: string,
  source: string,
  userType: string,
  page = 1,
  limit = 10,
) {
  const { data, isLoading, error } = useQuery<UserActivityResponse, Error>({
    queryKey: ["user-questions-data", userEmail, source, userType, page, limit],

    enabled: !!userEmail,

    staleTime: 30 * 1000,

    // @ts-ignore
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();

      const params = new URLSearchParams();

      params.set("userEmail", userEmail);
      params.set("source", source);
      params.set("userType", userType);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const result = await apiFetch<UserActivityResponse>(
        `${API_BASE_URL}/analytics/user-questions-data?${params.toString()}`,
      );

      return (
        result ?? {
          questions: {
            totalQuestions: 0,
            totalPages: 1,
            currentPage: 1,
            limit: 10,
            items: [],
          },
          messages: {
            totalMessages: 0,
            totalPages: 1,
            currentPage: 1,
            limit: 10,
            items: [],
          },
        }
      );
    },
  });

  return {
    data: data ?? {
      questions: {
        totalQuestions: 0,
        totalPages: 1,
        currentPage: 1,
        limit: 10,
        items: [],
      },

      messages: {
        totalMessages: 0,
        totalPages: 1,
        currentPage: 1,
        limit: 10,
        items: [],
      },
    },

    isLoading,

    error,
  };
}
