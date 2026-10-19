import { useInfiniteQuery } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import type { ClosedAnswerFilters } from "@/types";

const answerService = new AnswerService();

// Loads closed answers page by page for the infinite scrolling review list.
export const useGetClosedAnswers = (
  limit: number,
  search: string,
  filters: ClosedAnswerFilters,
) => {
  return useInfiniteQuery({
    queryKey: ["closed-answers", limit, search, filters],
    queryFn: ({ pageParam }) =>
      answerService.getClosedAnswers(pageParam, limit, search, filters),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.answers.length < limit) return undefined;
      return allPages.length + 1;
    },
  });
};
