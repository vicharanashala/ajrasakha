import {  useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

const questionService = new QuestionService();

// export const useGetAllDetailedQuestions = (
//   limit: number,
//   filter: AdvanceFilterValues,
//   search: string
// ) => {
//   return useInfiniteQuery({
//     queryKey: ["detailed_questions", limit, filter, search],
//     queryFn: async ({ pageParam }) => {
//       return await questionService.useGetAllDetailedQuestions(
//         pageParam,
//         limit,
//         filter,
//         search
//       );
//     },
//     initialPageParam: 1,
//     getNextPageParam: (lastPage, allPages) => {
//       if (lastPage && lastPage.length < limit) return undefined;
//       return allPages.length + 1;
//     },
//   });
// };

export const useGetAllDetailedQuestions = (
  page: number,
  limit: number,
  filter: AdvanceFilterValues,
  search: string
) => {
  return useQuery({
    queryKey: ["detailed_questions", page, limit, filter, search],
    queryFn: async () => {
      const data = await questionService.useGetAllDetailedQuestions(
        page,
        limit,
        filter,
        search
      );
      return data;
    },
  });
};
