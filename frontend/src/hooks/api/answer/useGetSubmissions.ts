import { useInfiniteQuery } from "@tanstack/react-query";
import { AnswerService } from "../services/answerService";

const answerService = new AnswerService();

export const useGetSubmissions = (limit: number) => {
  return useInfiniteQuery({
    queryKey: ["submissions"],
    queryFn: async ({ pageParam }) => {
      return await answerService.getSubmissions(pageParam, limit);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage && lastPage.length < limit) return undefined;
      return allPages.length + 1;
    },
  });
};
