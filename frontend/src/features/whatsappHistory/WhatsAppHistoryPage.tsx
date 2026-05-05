import { ThreadSidebar } from './components/ThreadSidebar';
import { ChatWindow } from './components/ChatWindow';
import { useWhatsAppHistory } from './hooks/useWhatsAppHistory';

export function WhatsAppHistoryPage() {
  const {
    selectedThreadId,
    setSelectedThreadId,
    searchQuery,
    setSearchQuery,
    threads,
    messages,
    isLoadingThreads,
    isLoadingMessages,
    selectedThread,
  } = useWhatsAppHistory();

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full overflow-hidden rounded-xl border border-border shadow-2xl bg-background">
      <ThreadSidebar
        threads={threads}
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