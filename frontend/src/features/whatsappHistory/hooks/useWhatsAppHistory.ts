import { useState, useMemo, useEffect } from 'react';
import { useThreads } from './useThreads';
import { useThreadDetails } from './useThreadDetails';
import { useSendMessage } from './useSendMessage';

export function useWhatsAppHistory() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>("");
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  
  // Local cache for latest messages to override the initial 'thread_name' from API
  const [lastMessageOverrides, setLastMessageOverrides] = useState<Record<string, string>>({});

  const { data: threads = [], isLoading: isLoadingThreads } = useThreads();
  const { data: messages = [], isLoading: isLoadingMessages } = useThreadDetails(selectedThreadId);

  // Sync the latest message to our local overrides whenever a thread is loaded
  useEffect(() => {
    if (messages.length > 0 && selectedThreadId) {
      // Find the last message that isn't just a tool-only AI response if possible
      const lastMeaningfulMsg = [...messages].reverse().find(m => m.content && m.content.length > 0);
      if (lastMeaningfulMsg) {
        setLastMessageOverrides(prev => ({
          ...prev,
          [selectedThreadId]: lastMeaningfulMsg.content
        }));
      }
    }
  }, [messages, selectedThreadId]);

  const enrichedThreads = useMemo(() => {
    return threads.map(t => ({
      ...t,
      lastMessage: lastMessageOverrides[t.id] || t.lastMessage
    }));
  }, [threads, lastMessageOverrides]);

  const filteredThreads = useMemo(() => {
    return enrichedThreads.filter(t => {
      // Search query filter
      const matchesSearch = t.phoneNumber.includes(searchQuery) ||
        t.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Date filter
      if (selectedDate) {
        // Extract date from thread ID: phoneNumber-YYYY-MM-DD
        const parts = t.id.split('-');
        if (parts.length >= 4) {
          const threadDateStr = `${parts[1]}-${parts[2]}-${parts[3]}`;
          const threadDate = new Date(threadDateStr);
          
          // Compare dates (ignoring time)
          return threadDate.getFullYear() === selectedDate.getFullYear() &&
                 threadDate.getMonth() === selectedDate.getMonth() &&
                 threadDate.getDate() === selectedDate.getDate();
        }
        // If thread ID doesn't have a date but we have a selected date, don't show it
        return false;
      }

      return true;
    });
  }, [enrichedThreads, searchQuery, selectedDate]);

  const selectedThread = useMemo(() =>
    threads.find(t => t.id === selectedThreadId),
    [threads, selectedThreadId]
  );

  const sendMessageMutation = useSendMessage(selectedThreadId, selectedThread?.phoneNumber);

  const canSendMessage = useMemo(() => {
    if (!selectedThread?.lastMessageTimestamp) return false;
    const lastMsgDate = new Date(selectedThread.lastMessageTimestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - lastMsgDate.getTime()) / (1000 * 60 * 60);
    return diffInHours < 24;
  }, [selectedThread]);

  return {
    selectedThreadId,
    setSelectedThreadId,
    searchQuery,
    setSearchQuery,
    selectedDate,
    setSelectedDate,
    threads: filteredThreads,
    messages,
    isLoadingThreads,
    isLoadingMessages,
    selectedThread,
    canSendMessage,
    sendMessage: (content: string) => sendMessageMutation.mutate(content),
    isSending: sendMessageMutation.isPending,
  };
}
