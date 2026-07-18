import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cropCalendarService,
  type IReminder,
} from "../../services/cropCalendarService";

export const useCreateReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["cropCalendar", "createReminder"],
    mutationFn: async (data: {
      cropName: string;
      activity: string;
      remindBeforeDays: number;
    }): Promise<IReminder> => {
      return await cropCalendarService.createReminder(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cropCalendar", "reminders"] });
    },
  });
};
