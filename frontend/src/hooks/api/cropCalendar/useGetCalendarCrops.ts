import { useQuery } from "@tanstack/react-query";
import { cropCalendarService } from "../../services/cropCalendarService";

export const useGetCalendarCrops = () => {
  return useQuery({
    queryKey: ["cropCalendar", "crops"],
    queryFn: async () => {
      return await cropCalendarService.getCrops();
    },
  });
};
