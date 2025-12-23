import { useQuery } from "@tanstack/react-query";

import { UserService } from "../../services/userService";
import type { ReviewLevelCount } from "@/types";
import type { DateRange } from "@/components/dashboard/questions-analytics";
type UseGetReviewLevelParams = {
  userId?: string;
  dateRange?: DateRange;
  role?: string;
  state?:string,
  crop?: string,
  domain?: string,
  status?: string,
};

const userService = new UserService();

export const useGetReviewLevel = ({
  userId,
  dateRange,
  role,
  state,crop,domain,status
}: UseGetReviewLevelParams) => {
  const { startTime, endTime } = dateRange ?? {};
  const { data, isLoading, error } = useQuery<ReviewLevelCount[] | null, Error>({
    queryKey: ["userReviewLevel",userId,startTime,endTime,state,crop,domain,status],
    queryFn: async () => {
      return await userService.getUserReviewLevel(userId,startTime,endTime,role,state,crop,domain,status);
    },
  });

  return { data, isLoading, error };
};
