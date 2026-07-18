import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cropCalendarService } from "../../services/cropCalendarService";

export const useDeleteReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["cropCalendar", "deleteReminder"],
    mutationFn: async (id: string): Promise<void> => {
      await cropCalendarService.deleteReminder(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cropCalendar", "reminders"] });
    },
  });
};
