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
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col p-4 cursor-pointer transition-colors border-b border-border/50 hover:bg-accent/50 w-full overflow-hidden",
        isActive && "bg-accent border-l-4 border-l-primary"
      )}
    >
      <div className="flex justify-between items-center gap-2 mb-1 w-full">
        <span className="font-medium text-sm truncate min-w-0 flex-1">
          {formatPhoneNumber(thread.phoneNumber)}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
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
