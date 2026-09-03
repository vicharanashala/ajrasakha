import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import type { ModeratorAuditTrail } from "@/types";

const API_BASE_URL = env.apiBaseUrl();

interface IAuditTrailCropResponse {
  data: ModeratorAuditTrail[];
  message: string;
  totalDocuments: number;
  totalPages: number;
  currentPage: number;
}

export const useGetAuditTrailsByCropId = (
  cropId: string | undefined,
  enabled: boolean = false,
  page: number = 1,
  limit: number = 50,
  action?: string | null,
  order: "asc" | "desc" = "desc"
) => {
  const { data, isLoading, error, refetch } = useQuery<
    IAuditTrailCropResponse | null,
    Error
  >({
    queryKey: ["audit-trails-by-crop", cropId, page, limit, action, order],
    queryFn: async () => {
      if (!cropId) return null;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        order,
      });
      if (action && action.trim() !== "") {
        params.append("action", action);
      }
      return apiFetch<IAuditTrailCropResponse>(
        `${API_BASE_URL}/audit-trails/crop/${cropId}?${params.toString()}`,
      );
    },
    enabled: !!cropId && enabled,
  });

  return { data, isLoading, error, refetch };
};
