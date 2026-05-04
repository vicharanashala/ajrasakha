import { useState, useMemo } from 'react';
import { ThreadSidebar } from './components/ThreadSidebar';
import { ChatWindow } from './components/ChatWindow';
import type { Thread, Message } from './types';

// Mock Data
const MOCK_THREADS: Thread[] = [
  {
    id: '1',
    phoneNumber: '919876543210',
    lastMessage: 'I will help you with information on growing paddy in Kerala...',
    lastMessageTimestamp: new Date(Date.now() - 1000 * 60 * 30),
    unreadCount: 2,
  },
  {
    id: '2',
    phoneNumber: '917994170107',
    lastMessage: 'Your question has been uploaded to our Agri experts.',
    lastMessageTimestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: '3',
    phoneNumber: '918888888888',
    lastMessage: 'Thank you for your query. Here is the answer.',
    lastMessageTimestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
];

const MOCK_MESSAGES: Record<string, Message[]> = {
  '1': [
    {
      id: 'm1',
      role: 'user',
      content: 'How can I grow paddy in kerala?',
      timestamp: new Date(Date.now() - 1000 * 60 * 35),
    },
    {
      id: 'm2',
      role: 'assistant',
      content: "I'll help you with information on growing paddy in Kerala. Let me first upload your question to our Agri experts and then gather some context for you.",
      timestamp: new Date(Date.now() - 1000 * 60 * 34),
    },
    {
      id: 'm3',
      role: 'assistant',
      content: "Growing paddy in Kerala requires specific attention to the monsoon seasons (Virippu and Mundakan). Ensure you use high-yielding varieties like Uma or Jyothi for better results in acidic soils.",
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
    },
  ],
  '2': [
    {
      id: 'm4',
      role: 'user',
      content: 'What is the price of rubber today?',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2.5),
    },
    {
      id: 'm5',
      role: 'assistant',
      content: 'The current market price for RSS-4 grade rubber in Kottayam is ₹185 per kg.',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2.2),
    },
  ]
};

export function WhatsAppHistoryPage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>("");
  const [searchQuery, setSearchQuery] = useState('');

  const filteredThreads = useMemo(() => {
    return MOCK_THREADS.filter(t =>
      t.phoneNumber.includes(searchQuery) ||
      t.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const selectedThread = useMemo(() =>
    MOCK_THREADS.find(t => t.id === selectedThreadId),
    [selectedThreadId]
  );

  const currentMessages = useMemo(() =>
    selectedThreadId ? (MOCK_MESSAGES[selectedThreadId] || []) : [],
    [selectedThreadId]
  );

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full overflow-hidden rounded-xl border border-border shadow-2xl bg-background">
      <ThreadSidebar
        threads={filteredThreads}
        selectedThreadId={selectedThreadId}
        onThreadSelect={setSelectedThreadId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <ChatWindow
        selectedThread={selectedThread}
        messages={currentMessages}
      />
    </div>
  );
}
