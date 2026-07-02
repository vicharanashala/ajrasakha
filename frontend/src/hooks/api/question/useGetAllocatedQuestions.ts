import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { QuestionFilter } from "@/features/qa-interface-page/QA-interface";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

const questionService = new QuestionService();
export const useGetAllocatedQuestions = (
  limit: number,
  filter: QuestionFilter,
  preferences: AdvanceFilterValues,
  actionType:string,
  autoSelectQuestionId?:string|null,
  reviewLevel?:string,
  includeRerouted?:boolean
) => {
  return useInfiniteQuery({
    queryKey: ["questions", limit, filter, preferences,actionType,reviewLevel,includeRerouted],
    queryFn: async ({ pageParam }) => {
      return await questionService.useGetAllocatedQuestions(
        pageParam,
        limit,
        filter,
        preferences,
        actionType,
        autoSelectQuestionId,
        reviewLevel,
        includeRerouted

      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage && lastPage.length < limit) return undefined;
      return allPages.length + 1;
    },
    // Periodic safety refresh. Long interval + background-paused to limit load —
    // note an infinite query refetches every loaded page on each tick.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
};

export const useGetAllocatedQuestionPage = (questionId?: string) => {
  return useQuery({
    queryKey: ["allocated-question-page", questionId],
    queryFn: () => questionService.getAllocatedQuestionPage(questionId!),
    enabled: !!questionId,
  });
};
