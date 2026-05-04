import { Search, Home } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Input } from '@/components/atoms/input';
import { ThreadItem } from './ThreadItem';
import { Thread } from '../types';

interface ThreadSidebarProps {
  threads: Thread[];
  selectedThreadId?: string;
  onThreadSelect: (threadId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ThreadSidebar({
  threads,
  selectedThreadId,
  onThreadSelect,
  searchQuery,
  onSearchChange,
}: ThreadSidebarProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full border-r border-border bg-card w-80 shrink-0">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">WhatsApp History</h2>
          <button 
            onClick={() => navigate({ to: '/home' })}
            className="p-2 hover:bg-accent rounded-full transition-colors text-muted-foreground hover:text-foreground"
            title="Back to Home"
          >
            <Home className="h-5 w-5" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search threads..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threads.length > 0 ? (
          threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={selectedThreadId === thread.id}
              onClick={() => onThreadSelect(thread.id)}
            />
          ))
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            No threads found
          </div>
        )}
      </div>
    </div>
  );
}
