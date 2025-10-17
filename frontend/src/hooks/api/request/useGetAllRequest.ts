import { useQuery } from "@tanstack/react-query";
import { RequestService } from "../../services/requestService";

const requestService = new RequestService();

export const useGetAllRequests = (
  page: number,
  limit: number,
  status: "all" | "pending" | "rejected" | "approved" | "in-review",
  requestType: "all" | "question_flag" | "others",
  sortOrder: "newest" | "oldest"
) => {
  return useQuery({
    queryKey: ["requests", page, limit, status, requestType, sortOrder],
    queryFn: async () => {
      return await requestService.getAllRequests({
        page,
        limit,
        status,
        requestType,
        sortOrder
      });
    },
  });
};
