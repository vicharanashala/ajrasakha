import { useInfiniteQuery } from "@tanstack/react-query";
import { RequestService } from "../services/requestService";

const requestService = new RequestService();

export const useGetAllRequests = (
  limit: number,
  status: "all" | "pending" | "rejected" | "approved" | "in-review",
  requestType: "all" | "question_flag" | "others"
) => {
  return useInfiniteQuery({
    queryKey: ["requests", limit, status, requestType],
    queryFn: async ({ pageParam = 1 }) => {
      return await requestService.getAllRequests({
        page: pageParam,
        limit,
        status,
        requestType,
      });
    },
    initialPageParam: 1,

    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage) return undefined;
      if (lastPage.requests.length < limit) return undefined;
      return allPages.length + 1;
    },
  });
};
