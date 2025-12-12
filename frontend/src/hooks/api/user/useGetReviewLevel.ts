import { useQuery } from "@tanstack/react-query";

import { UserService } from "../../services/userService";
import type { ReviewLevelCount } from "@/types";
import type { DateRange } from "@/components/dashboard/questions-analytics";

const userService = new UserService();

export const useGetReviewLevel = (userId:string|undefined,{ startTime, endTime }: DateRange) => {
  const { data, isLoading, error } = useQuery<ReviewLevelCount[] | null, Error>({
    queryKey: ["userReviewLevel",userId,startTime,endTime],
    queryFn: async () => {
      return await userService.getUserReviewLevel(userId,startTime,endTime);
    },
  });

  return { data, isLoading, error };
};
