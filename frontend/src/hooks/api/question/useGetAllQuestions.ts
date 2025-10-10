import { useInfiniteQuery } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";
import type { QuestionFilter } from "@/components/QA-interface";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

const questionService = new QuestionService();

export const useGetAllQuestions = (
  limit: number,
  filter: QuestionFilter,
  preferences: AdvanceFilterValues
) => {
  return useInfiniteQuery({
    queryKey: ["questions", limit, filter, preferences],
    queryFn: async ({ pageParam }) => {
      return await questionService.getAllQuestions(
        pageParam,
        limit,
        filter,
        preferences
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage && lastPage.length < limit) return undefined;
      return allPages.length + 1;
    },
  });
};
