import { useState, useMemo, useEffect } from 'react';
import { useThreads } from './useThreads';
import { useThreadDetails } from './useThreadDetails';
import { useSendMessage } from './useSendMessage';
import { useSearch, useNavigate } from '@tanstack/react-router';

export function useWhatsAppHistory() {
  const search = useSearch({ from: '/whatsapp-history' });
  const navigate = useNavigate();

  const todayIST = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });

  const selectedThreadId = search.threadId ?? '';
  const selectedDate = search.date ?? todayIST;

  const setSelectedThreadId = (threadId: string) => {
  navigate({
    to: '/whatsapp-history',
    search: (prev: Record<string, string>) => ({ 
      ...prev, 
      threadId,
      date: todayIST,
    }),
  });
};

const setSelectedDate = (date: string) => {
  navigate({
    to: '/whatsapp-history',
    search: (prev: Record<string, string>) => ({ ...prev, date }),
  });
};
  const [searchQuery, setSearchQuery] = useState('');
  const [lastMessageOverrides, setLastMessageOverrides] = useState<Record<string, string>>({});

  const { data: threads = [], isLoading: isLoadingThreads } = useThreads();
  const { data: messages = [], isLoading: isLoadingMessages } = useThreadDetails(selectedThreadId, selectedDate);

  useEffect(() => {
    if (messages.length > 0 && selectedThreadId) {
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

  const selectedThread = useMemo(() => {
  const phoneNumber = selectedThreadId.includes('-')
    ? selectedThreadId.split('-')[0]
    : selectedThreadId;
  return threads.find(t => t.id === phoneNumber || t.id === selectedThreadId);
}, [threads, selectedThreadId]);

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
    selectedDate,
    setSelectedDate,
    searchQuery,
    setSearchQuery,
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