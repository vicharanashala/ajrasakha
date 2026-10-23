import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import type { ModeratorAuditTrail } from "@/types";

const API_BASE_URL = env.apiBaseUrl();

export interface CropManagementAuditFilters {
  page: number;
  limit: number;
  action?: string;
  status?: string;
  /** ISO date-time bounds. */
  start?: string;
  end?: string;
  order: "asc" | "desc";
  search?: string;
  importId?: string;
  source?: string;
}

interface CropManagementAuditResponse {
  data: ModeratorAuditTrail[];
  totalDocuments: number;
  totalPages: number;
  currentPage: number;
}

// Fetches the AgriTech Management audit trail, keeping the previous page visible while
// the next one loads so filtering and paging do not flash an empty list.
export const useGetCropManagementAudits = (
  filters: CropManagementAuditFilters,
  enabled: boolean,
) =>
  useQuery<CropManagementAuditResponse | null, Error>({
    queryKey: ["audit-trails-crop-management", filters],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
        order: filters.order,
      });
      const optional: [string, string | undefined][] = [
        ["action", filters.action],
        ["status", filters.status],
        ["start", filters.start],
        ["end", filters.end],
        ["search", filters.search],
        ["importId", filters.importId],
        ["source", filters.source],
      ];
      optional.forEach(([key, value]) => value && params.append(key, value));
      return apiFetch<CropManagementAuditResponse>(
        `${API_BASE_URL}/audit-trails/crop-management?${params.toString()}`,
      );
    },
    enabled,
    placeholderData: keepPreviousData,
  });
