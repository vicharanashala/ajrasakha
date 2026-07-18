import { useQuery } from "@tanstack/react-query";
import { cropCalendarService } from "../../services/cropCalendarService";

export const useGetUpcomingActivities = (cropName: string | null) => {
  return useQuery({
    queryKey: ["cropCalendar", "upcoming", cropName],
    queryFn: async () => {
      if (!cropName) return [];
      return await cropCalendarService.getUpcoming(cropName);
    },
    enabled: !!cropName,
  });
};
