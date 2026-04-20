import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

const questionService = new QuestionService();


export const useGetAllDetailedQuestions = (
  page: number,
  limit: number,
  filter: AdvanceFilterValues,
  search: string,
  enabled: boolean,
  sort?: string
) => {
  return useQuery({
    queryKey: ["detailed_questions", page, limit, filter, search, sort],
    queryFn: async () =>
      questionService.useGetAllDetailedQuestions(page, limit, filter, search, sort),
    enabled,
  });
};
