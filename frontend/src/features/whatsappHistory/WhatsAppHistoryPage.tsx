import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ThreadSidebar } from './components/ThreadSidebar';
import { ChatWindow } from './components/ChatWindow';
import type { Thread, Message } from './types';

import { env } from '@/config/env';
import { apiFetch } from '@/hooks/api/api-fetch';

function useThreads() {
  return useQuery({
    queryKey: ['whatsapp-threads'],
    queryFn: async () => {
      const data = await apiFetch<Thread[]>(`${env.apiBaseUrl()}/whatsapp/threads`);
      if (!data) throw new Error('Failed to fetch threads');
      return data;
    },
  });
}

function useThreadDetails(threadId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-thread-details', threadId],
    queryFn: async () => {
      if (!threadId) return [];

      const data = await apiFetch<Message[]>(`${env.apiBaseUrl()}/whatsapp/threads/${threadId}`);
      if (!data) throw new Error('Failed to fetch thread details');
      return data;
    },
    enabled: !!threadId,
  });
}

export function WhatsAppHistoryPage() {
  const queryClient = useQueryClient();
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

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full overflow-hidden rounded-xl border border-border shadow-2xl bg-background">
      <ThreadSidebar
        threads={filteredThreads}
        selectedThreadId={selectedThreadId}
        onThreadSelect={setSelectedThreadId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isLoading={isLoadingThreads}
      />
      <ChatWindow
        selectedThread={selectedThread}
        messages={messages}
        isLoading={isLoadingMessages}
      />
    </div>
  );
}