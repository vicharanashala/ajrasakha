import { useQuery } from "@tanstack/react-query";
import { RequestService } from "../services/requestService";

const requestService = new RequestService();

export const useGetRequestDiff = (reqId: string) => {
  return useQuery({
    queryKey: ["request_diff", reqId],
    queryFn: async () => {
      return await requestService.getRequestDiff(reqId);
    },
    enabled: !!reqId
  });
};
