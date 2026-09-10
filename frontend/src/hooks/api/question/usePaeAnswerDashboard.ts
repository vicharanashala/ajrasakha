import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { PaeAnswerDashboardResponse } from "../../services/questionService";

const questionService = new QuestionService();

/**
 * Gate-keeper-style dashboard for a PAE's answering flow: assigned + submitted
 * counts and a paginated list of their questions (each flagged submitted/pending).
 * Managers pass the PAE's `userId`; a PAE omits it to see their own.
 */
export const usePaeAnswerDashboard = (
  page: number,
  limit: number,
  options: {
    enabled?: boolean;
    search?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  } = {},
) => {
  return useQuery<PaeAnswerDashboardResponse | null>({
    queryKey: [
      "pae-answer-dashboard",
      page,
      limit,
      options.search,
      options.userId ?? "self",
      options.startDate,
      options.endDate,
    ],
    queryFn: () =>
      questionService.getPaeAnswerDashboard(page, limit, {
        search: options.search,
        userId: options.userId,
        startDate: options.startDate,
        endDate: options.endDate,
      }),
    enabled: options.enabled ?? true,
  });
};
