import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from 'sonner';
import type { Message } from '../types';

export function useSendMessage(threadId: string | undefined, phoneNumber: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageText: string) => {
      if (!phoneNumber) throw new Error('No phone number available');

      const response = await apiFetch(`${env.apiBaseUrl()}/whatsapp/send-message`, {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber,
          messageText,
        }),
      });
      return response;
    },
    onMutate: async (messageText: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['whatsapp-thread-details', threadId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<Message[]>(['whatsapp-thread-details', threadId]);

      // Optimistically update to the new value
      if (previousMessages) {
        const optimisticMessage: Message = {
          id: `temp-${Date.now()}`,
          role: 'assistant',
          content: messageText,
          timestamp: new Date(),
          status: 'sending'
        };
        queryClient.setQueryData(['whatsapp-thread-details', threadId], [...previousMessages, optimisticMessage]);
      }

      return { previousMessages };
    },
    onSuccess: () => {
      toast.success('Message sent to user successfully!');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-thread-details', threadId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-threads'] });
    },
    onError: (err, newMessage, context) => {
      toast.error(`Failed to send message to user: ${err.message}`);
      // Rollback to the previous value
      if (context?.previousMessages) {
        queryClient.setQueryData(['whatsapp-thread-details', threadId], context.previousMessages);
      }
    },
  });
}
