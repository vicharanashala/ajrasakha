import { formatDistanceToNow } from 'date-fns';
import type { Thread } from '../types';
import { cn } from '@/lib/utils';

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
}

export function ThreadItem({ thread, isActive, onClick }: ThreadItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col p-4 cursor-pointer transition-colors border-b border-border/50 hover:bg-accent/50",
        isActive && "bg-accent border-l-4 border-l-primary"
      )}
    >
      <div className="flex justify-between items-start mb-1">
        <span className="font-medium text-sm">+{thread.phoneNumber}</span>
        <span className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(thread.lastMessageTimestamp, { addSuffix: true })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-1 truncate">
        {thread.lastMessage}
      </p>
      {thread.unreadCount && thread.unreadCount > 0 ? (
        <div className="mt-2 flex justify-end">
          <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {thread.unreadCount}
          </span>
        </div>
      ) : null}
    </div>
  );
}
