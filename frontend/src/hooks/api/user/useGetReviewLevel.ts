import { useQuery } from "@tanstack/react-query";

import { UserService } from "../../services/userService";
import type { ReviewLevelCount } from "@/types";

const userService = new UserService();

export const useGetReviewLevel = (userId:string|undefined) => {
  const { data, isLoading, error } = useQuery<ReviewLevelCount[] | null, Error>({
    queryKey: ["userReviewLevel"],
    queryFn: async () => {
      return await userService.getUserReviewLevel(userId);
    },
  });

  return { data, isLoading, error };
};
