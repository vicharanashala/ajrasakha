import { useInfiniteQuery } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";
import type { AdvanceFilterValues } from "@/components/questions-page";

const questionService = new QuestionService();

export const useGetAllDetailedQuestions = (
  limit: number,
  filter: AdvanceFilterValues,
  search: string
) => {
  return useInfiniteQuery({
    queryKey: ["detailed_questions", limit, filter, search],
    queryFn: async ({ pageParam }) => {
      return await questionService.useGetAllDetailedQuestions(
        pageParam,
        limit,
        filter,
        search
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage && lastPage.length < limit) return undefined;
      return allPages.length + 1;
    },
  });
};
