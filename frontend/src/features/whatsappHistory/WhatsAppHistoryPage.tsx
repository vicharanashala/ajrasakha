import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ThreadSidebar } from './components/ThreadSidebar';
import { ChatWindow } from './components/ChatWindow';
import type { Thread, Message } from './types';

// Base URL for LangGraph server from environment variables
const LANGRAPH_URL = `http://${import.meta.env.VITE_LANGRAPH_SERVER_IP}:${import.meta.env.VITE_LANGRAPH_SERVER_PORT}`;

function useThreads() {
  return useQuery({
    queryKey: ['whatsapp-threads'],
    queryFn: async () => {
      const response = await fetch(`${LANGRAPH_URL}/threads`);
      if (!response.ok) throw new Error('Failed to fetch threads');
      const data = await response.json();

      const threads: Thread[] = (data.threads as any[])
        .filter((t: any) => /^\d{12}$/.test(t.thread_id))
        .map((t: any) => ({
          id: t.thread_id,
          phoneNumber: t.thread_id,
          lastMessage: t.metadata.thread_name || 'No message available',
          lastMessageTimestamp: new Date(t.updated_at),
          unreadCount: 0,
        }));

      return threads;
    },
  });
}

function useThreadDetails(threadId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-thread-details', threadId],
    queryFn: async () => {
      if (!threadId) return [];
      
      const response = await fetch(`${LANGRAPH_URL}/threads/${threadId}/state`);
      if (!response.ok) throw new Error('Failed to fetch thread details');
      const data = await response.json();

      const messages = data.values.messages as any[];
      const formattedMessages: Message[] = [];
      
      // 1. First, map all tool responses in the entire thread
      const toolResponsesMap: Record<string, any> = {};
      messages.forEach((msg: any) => {
        if (msg.type === 'tool') {
          let response = msg.artifact?.structured_content?.result || msg.content;
          if (typeof response === 'string' && response.startsWith('{')) {
            try { response = JSON.parse(response); } catch (e) {}
          }
          toolResponsesMap[msg.tool_call_id] = response;
        }
      });

      // 2. Iterate through all messages to build the conversation
      messages.forEach((msg: any, idx: number) => {
        if (msg.type === 'human') {
          formattedMessages.push({
            id: msg.id || `h-${idx}`,
            role: 'user',
            content: typeof msg.content === 'string' ? msg.content : '',
            timestamp: new Date(data.created_at || Date.now()),
          });
        } else if (msg.type === 'ai') {
          const toolCalls = msg.tool_calls?.map((tc: any) => ({
            name: tc.name,
            args: tc.args,
            id: tc.id,
            response: toolResponsesMap[tc.id]
          })) || [];

          // Only add AI message if it has content OR tool calls
          const content = typeof msg.content === 'string' 
            ? msg.content 
            : (Array.isArray(msg.content) 
                ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') 
                : '');

          if (content || toolCalls.length > 0) {
            formattedMessages.push({
              id: msg.id || `a-${idx}`,
              role: 'assistant',
              content: content || (toolCalls.length > 0 ? "Executing tools..." : ""),
              timestamp: new Date(data.created_at || Date.now()),
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined
            });
          }
        }
      });

      return formattedMessages;
    },
    enabled: !!threadId,
  });
}

export function WhatsAppHistoryPage() {
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>("");
  const [searchQuery, setSearchQuery] = useState('');

  const { data: threads = [], isLoading: isLoadingThreads } = useThreads();
  const { data: messages = [], isLoading: isLoadingMessages } = useThreadDetails(selectedThreadId);

  // Sync the latest message to the sidebar threads list when details are fetched
  useEffect(() => {
    if (messages.length > 0 && selectedThreadId) {
      const lastMsg = messages[messages.length - 1];
      queryClient.setQueryData(['whatsapp-threads'], (oldThreads: Thread[] | undefined) => {
        if (!oldThreads) return oldThreads;
        return oldThreads.map(t => 
          t.id === selectedThreadId 
            ? { ...t, lastMessage: lastMsg.content } 
            : t
        );
      });
    }
  }, [messages, selectedThreadId, queryClient]);

  const filteredThreads = useMemo(() => {
    return threads.filter(t =>
      t.phoneNumber.includes(searchQuery) ||
      t.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [threads, searchQuery]);

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
