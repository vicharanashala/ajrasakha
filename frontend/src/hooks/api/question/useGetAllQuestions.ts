import { useInfiniteQuery } from "@tanstack/react-query";
import { QuestionService } from "../services/questionService";

const questionService = new QuestionService();

export const useGetAllQuestions = (limit: number) => {
  return useInfiniteQuery({
    queryKey: ["questions"],
    queryFn: async ({ pageParam }) => {
      return await questionService.getAllQuestions(pageParam, limit);
    }, 
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < 10) return undefined;
      return allPages.length + 1;
    },
  });
};
