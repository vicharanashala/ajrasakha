import { useMutation, useQueryClient } from "@tanstack/react-query";
import {toast} from "sonner";
import { NotificationService } from "@/hooks/services/notificationService";

const notificationService = new NotificationService();

export const useDeleteNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["deleteNotification"],
    mutationFn: async (notificationId: string): Promise<void> => {
      await notificationService.deleteNotification(notificationId);
    },
    onSuccess: () => {
      // toast.success("Notification deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: (error: any) => {
      toast.error("Failed to delete Notification");
      console.error("Delete Notification error:", error);
    },
  });
};
