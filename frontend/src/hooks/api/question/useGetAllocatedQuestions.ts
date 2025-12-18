import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { QuestionFilter } from "@/components/QA-interface";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

const questionService = new QuestionService();
export const useGetAllocatedQuestions = (
  limit: number,
  filter: QuestionFilter,
  preferences: AdvanceFilterValues,
  actionType:string,
  autoSelectQuestionId?:string|undefined
) => {
  return useInfiniteQuery({
    queryKey: ["questions", limit, filter, preferences,actionType],
    queryFn: async ({ pageParam }) => {
      return await questionService.useGetAllocatedQuestions(
        pageParam,
        limit,
        filter,
        preferences,
        actionType,
        autoSelectQuestionId

      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage && lastPage.length < limit) return undefined;
      return allPages.length + 1;
    },
  });
};

export const useGetAllocatedQuestionPage = (questionId?: string) => {
  return useQuery({
    queryKey: ["allocated-question-page", questionId],
    queryFn: () => questionService.getAllocatedQuestionPage(questionId!),
    enabled: !!questionId,
  });
};
