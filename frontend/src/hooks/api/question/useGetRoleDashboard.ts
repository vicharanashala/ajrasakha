import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { RoleDashboardResponse } from "../../services/questionService";

const questionService = new QuestionService();

/**
 * Dashboard data for the logged-in gate keeper / auditor: assigned + submitted
 * (finished) counts and a paginated list of their assigned questions.
 */
export const useGetRoleDashboard = (
  page: number,
  limit: number,
  search: string,
  options: {
    enabled?: boolean;
    userId?: string;
    role?: "gate_keeper" | "auditor";
    startDate?: string;
    endDate?: string;
    dateFilterType?: "assigned" | "completed" | "both";
  } = {},
) => {
  return useQuery<RoleDashboardResponse | null>({
    queryKey: ["role_dashboard", page, limit, search, options.userId, options.role, options.startDate, options.endDate, options.dateFilterType],
    queryFn: () =>
      questionService.getRoleDashboard(
        page,
        limit,
        search,
        options.userId,
        options.role,
        options.startDate,
        options.endDate,
        options.dateFilterType,
      ),
    enabled: options.enabled ?? true,
  });
};
