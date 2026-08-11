import { useInfiniteQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

/**
 * Hook to fetch paginated questions assigned to the current PAE expert for validation.
 * Returns questions with their final answers and sources included.
 * 
 * @param limit - Number of items per page (default: 10)
 */
export const useGetPaeValidationAssignedQuestions = (limit: number = 10) => {
  return useInfiniteQuery({
    queryKey: ["pae-validation-assigned-questions", limit],
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      return await questionService.getPaeValidationAssignedQuestions(page, limit);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage) return undefined;
      // If current page is >= total pages, stop pagination
      if (lastPage.currentPage >= lastPage.totalPages) return undefined;
      return lastPage.currentPage + 1;
    },
    // Periodic safety refresh
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
};