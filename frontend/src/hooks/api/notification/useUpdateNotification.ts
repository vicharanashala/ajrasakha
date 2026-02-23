import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {INotification } from "@/types";
import { NotificationService } from "@/hooks/services/notificationService";

const notificationService = new NotificationService();

export const useMarkAsReadNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["updateNotification"],
    mutationFn: async (
      notificationId:string
    ): Promise<INotification | null> => {
      return await notificationService.markNotificationAsRead(notificationId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
};