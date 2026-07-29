import { useQuery } from "@tanstack/react-query";
import { UserService, type TrendGranularity } from "@/hooks/services/userService";

const userService = new UserService();

export const useGetWorkingHours = (
  userId?: string,
  startDateTime?: string,
  endDateTime?: string,
) => {
  return useQuery<{ workingHours: number } | null, Error>({
    queryKey: ["working-hours", userId, startDateTime, endDateTime],
    enabled: Boolean(userId && startDateTime && endDateTime),
    queryFn: async () => {
      if (!userId || !startDateTime || !endDateTime) {
        return { workingHours: 0 };
      }
      return userService.getWorkingHours(userId, startDateTime, endDateTime);
    },
  });
};


export const useGetWorkingHoursTrends = (
  userId?: string,
  startDateTime?: string,
  endDateTime?: string,
  granularity: TrendGranularity = "day",
) => {
  return useQuery<any | null, Error>({
    queryKey: ["working-hours", userId, startDateTime, endDateTime, granularity],
    enabled: Boolean(userId && startDateTime && endDateTime),
    queryFn: async () => {
      if (!userId || !startDateTime || !endDateTime) {
        return [];
      }
      return userService.getWorkingHoursTrends(userId, startDateTime, endDateTime, granularity,);
    },
  });
};
