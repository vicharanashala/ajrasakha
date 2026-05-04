import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
          lastMessage: t.metadata.thread_name || 'WhatsApp Conversation',
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
      
      // 1. Find the last human message index
      const lastHumanIndex = [...messages].reverse().findIndex((m: any) => m.type === 'human');
      if (lastHumanIndex === -1) return [];
      
      const humanIdx = messages.length - 1 - lastHumanIndex;
      const humanMsg = messages[humanIdx];

      // 2. Collect all tool calls and tool responses after this human message
      const toolCallsMap: Record<string, any> = {};
      const toolResponsesMap: Record<string, any> = {};
      let finalAiMsg = null;

      for (let i = humanIdx + 1; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.type === 'ai') {
          finalAiMsg = msg;
          if (msg.tool_calls) {
            msg.tool_calls.forEach((tc: any) => {
              toolCallsMap[tc.id] = { ...tc };
            });
          }
        } else if (msg.type === 'tool') {
          // Extract response from artifact or content
          let response = msg.artifact?.structured_content?.result || msg.content;
          if (typeof response === 'string' && response.startsWith('{')) {
            try { response = JSON.parse(response); } catch (e) {}
          }
          toolResponsesMap[msg.tool_call_id] = response;
        }
      }

      const formattedMessages: Message[] = [];

      // Add the user message
      formattedMessages.push({
        id: humanMsg.id || `h-${humanIdx}`,
        role: 'user',
        content: typeof humanMsg.content === 'string' ? humanMsg.content : '',
        timestamp: new Date(data.created_at || Date.now()),
      });

      // Add the final AI message with all collected tool calls and their responses
      if (finalAiMsg) {
        const toolCalls = Object.values(toolCallsMap).map((tc: any) => ({
          name: tc.name,
          args: tc.args,
          id: tc.id,
          response: toolResponsesMap[tc.id]
        }));

        formattedMessages.push({
          id: finalAiMsg.id || `a-${messages.length}`,
          role: 'assistant',
          content: typeof finalAiMsg.content === 'string' 
            ? finalAiMsg.content 
            : (Array.isArray(finalAiMsg.content) 
                ? finalAiMsg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') 
                : ''),
          timestamp: new Date(data.created_at || Date.now()),
          toolCalls
        });
      }

      return formattedMessages;
    },
    enabled: !!threadId,
  });
}

export function WhatsAppHistoryPage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>("");
  const [searchQuery, setSearchQuery] = useState('');

  const { data: threads = [], isLoading: isLoadingThreads } = useThreads();
  const { data: messages = [], isLoading: isLoadingMessages } = useThreadDetails(selectedThreadId);

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
