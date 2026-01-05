import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "@/hooks/services/questionService";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

const questionService = new QuestionService();
export const useGetQuestionsAndLevel = (
  page: number,
  limit: number,
  search: string,
  filter: AdvanceFilterValues,
  enabled: boolean
) => {
  return useQuery({
    queryKey: ["questions_levels", page, limit, search, filter],
    queryFn: async () =>
      questionService.GetQuestionsAndLevels(page, limit, search, filter),
    enabled,
  });
};
