import { useQuery } from "@tanstack/react-query";
import { cropCalendarService } from "../../services/cropCalendarService";

export const useGetReminders = () => {
  return useQuery({
    queryKey: ["cropCalendar", "reminders"],
    queryFn: async () => {
      return await cropCalendarService.getReminders();
    },
  });
};
