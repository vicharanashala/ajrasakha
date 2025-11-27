import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";

const answerService = new AnswerService();

// export const useGetSubmissions = (limit: number,dateRange:any) => {
//   return useInfiniteQuery({
//     queryKey: ["submissions"],
//     queryFn: async ({ pageParam }) => {
//       return await answerService.getSubmissions(pageParam, limit,dateRange);
//     },
//     initialPageParam: 1,
//     getNextPageParam: (lastPage, allPages) => {
//       if (lastPage && lastPage.length < limit) return undefined;
//       return allPages.length + 1;
//     },
//   });
// };

export const useGetSubmissions = (page: number, limit: number, dateRange: any) => {
  return useQuery({
    queryKey: ["submissions", page, dateRange.start, dateRange.end],
    queryFn: () => answerService.getSubmissions(page, limit,{start:dateRange.start.toISOString(),end:dateRange.end.toISOString()})
  });
};

