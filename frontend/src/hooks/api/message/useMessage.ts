import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageService } from "../../services/messageService";

const messageService = new MessageService();

// ─── GET MESSAGES (polls every 4s so both sides see new messages) ──────────

export const useGetMessages = (dealId: string, enabled: boolean) => {
  return useQuery({
    queryKey: ["messages", dealId],
    queryFn: async () => await messageService.getMessages(dealId),
    enabled,
    refetchInterval: enabled ? 4000 : false,
  });
};

// ─── SEND MESSAGE ────────────────────────────────────────────────────────────

export const useSendMessage = (dealId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["sendMessage", dealId],
    mutationFn: async (text: string) => {
      return await messageService.sendMessage(dealId, text);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", dealId] });
    },
  });
};
