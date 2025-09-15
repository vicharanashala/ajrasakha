import { useInfiniteQuery } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";
import type { QuestionFilter } from "@/components/QA-interface";

const questionService = new QuestionService();

export const useGetAllQuestions = (limit: number, filter: QuestionFilter) => {
  return useInfiniteQuery({
    queryKey: ["questions", limit, filter],
    queryFn: async ({ pageParam }) => {
      return await questionService.getAllQuestions(pageParam, limit, filter);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage && lastPage.length < limit) return undefined;
      return allPages.length + 1;
    },
  });
};
