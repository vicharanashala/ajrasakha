import { useState, useMemo, useEffect } from 'react';
import { useThreads } from './useThreads';
import { useThreadDetails } from './useThreadDetails';

export function useWhatsAppHistory() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>("");
  const [searchQuery, setSearchQuery] = useState('');
  
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
    return enrichedThreads.filter(t =>
      t.phoneNumber.includes(searchQuery) ||
      t.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [enrichedThreads, searchQuery]);

  const selectedThread = useMemo(() =>
    threads.find(t => t.id === selectedThreadId),
    [threads, selectedThreadId]
  );

  return {
    selectedThreadId,
    setSelectedThreadId,
    searchQuery,
    setSearchQuery,
    threads: filteredThreads,
    messages,
    isLoadingThreads,
    isLoadingMessages,
    selectedThread,
  };
}
