import { useInfiniteQuery } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";

const answerService = new AnswerService();

// Loads closed answers page by page for the infinite scrolling review list.
export const useGetClosedAnswers = (limit: number, search: string) => {
  return useInfiniteQuery({
    queryKey: ["closed-answers", limit, search],
    queryFn: ({ pageParam }) =>
      answerService.getClosedAnswers(pageParam, limit, search),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.answers.length < limit) return undefined;
      return allPages.length + 1;
    },
  });
};
