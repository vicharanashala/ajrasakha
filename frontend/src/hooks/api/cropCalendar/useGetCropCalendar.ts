import { useQuery } from "@tanstack/react-query";
import { cropCalendarService } from "../../services/cropCalendarService";

export const useGetCropCalendar = (cropName: string | null) => {
  return useQuery({
    queryKey: ["cropCalendar", "calendar", cropName],
    queryFn: async () => {
      if (!cropName) return null;
      return await cropCalendarService.getCalendar(cropName);
    },
    enabled: !!cropName,
  });
};
