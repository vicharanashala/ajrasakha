import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Thread } from '../types';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/utils/formatPhoneNumber';

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
}

export function ThreadItem({ thread, isActive, onClick }: ThreadItemProps) {
  const cleanPhoneNumber = formatPhoneNumber(thread.phoneNumber);
  
  // Extract date from thread ID: phoneNumber-YYYY-MM-DD
  const dateFromId = useMemo(() => {
    const parts = thread.id.split('-');
    if (parts.length >= 4) {
      return `${parts[1]}-${parts[2]}-${parts[3]}`;
    }
    return null;
  }, [thread.id]);

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col p-4 cursor-pointer transition-colors border-b border-border/50 hover:bg-accent/50 w-full overflow-hidden",
        isActive && "bg-accent border-l-4 border-l-primary"
      )}
    >
      <div className="flex justify-between items-start gap-2 mb-1 w-full">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-sm truncate">
            {cleanPhoneNumber}
          </span>
          {dateFromId && (
            <span className="text-[10px] text-primary/70 font-medium">
              {dateFromId}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap mt-1">
          {formatDistanceToNow(thread.lastMessageTimestamp, { addSuffix: true })}
        </span>
      </div>
      <div className="w-full">
        <p className="text-xs text-muted-foreground truncate leading-relaxed">
          {thread.lastMessage.length > 40 
            ? `${thread.lastMessage.substring(0, 40)}...` 
            : thread.lastMessage}
        </p>
      </div>
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
