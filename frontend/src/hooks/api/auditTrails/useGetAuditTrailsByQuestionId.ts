import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import type { ModeratorAuditTrail } from "@/types";

const API_BASE_URL = env.apiBaseUrl();

interface IAuditTrailQuestionResponse {
  data: ModeratorAuditTrail[];
  message: string;
  totalDocuments: number;
  totalPages: number;
  currentPage: number;
}

export const useGetAuditTrailsByQuestionId = (
  questionId: string | undefined,
  enabled: boolean = false,
  page: number = 1,
  limit: number = 10,
  action?: string | null,
  order: "asc" | "desc" = "desc"
) => {
  const { data, isLoading, error, refetch } = useQuery<IAuditTrailQuestionResponse | null, Error>({
    queryKey: ["audit-trails-by-question", questionId, page, limit, action, order],
    queryFn: async () => {
      if (!questionId) return null;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        order,
      });
      if (action && action.trim() !== '') {
        params.append("action", action);
      }
      const url = `${API_BASE_URL}/audit-trails/question/${questionId}?${params.toString()}`;
      console.log("Fetching audit trails:", url);
      return apiFetch<IAuditTrailQuestionResponse>(url);
    },
    enabled: !!questionId && enabled,
  });

  return { data, isLoading, error, refetch };
};
