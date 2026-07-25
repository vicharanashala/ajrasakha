import { useQuery } from "@tanstack/react-query";
import { UserService } from "@/hooks/services/userService";

const userService = new UserService();

export const useReviewerLifecycle = (
  userId: string,
  startDate: Date,
  endDate: Date,
) => {
  return useQuery({
    queryKey: ["reviewer-lifecycle", userId, startDate, endDate],
    enabled: Boolean(userId && startDate && endDate),
    queryFn: () =>
      userService.getReviewerLifecycle(
        userId,
        startDate,
        endDate
      ),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
};