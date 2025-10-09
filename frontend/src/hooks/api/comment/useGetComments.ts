import { useInfiniteQuery } from "@tanstack/react-query";
import { CommentService } from "../services/commentService";

const commentService = new CommentService();

export const useGetComments = (
  limit: number,
  questionId?: string,
  answerId?: string
) => {
  return useInfiniteQuery({
    queryKey: ["comments"],
    queryFn: async ({ pageParam }) => {
      return await commentService.getComments(
        pageParam,
        limit,
        questionId,
        answerId
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage && lastPage.length < limit) return undefined;
      return allPages.length + 1;
    },
    enabled: Boolean(questionId && answerId),
  });
};
