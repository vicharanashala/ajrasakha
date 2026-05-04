import { format } from 'date-fns';
import type { Message } from '../types';
import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={cn(
        "flex w-full mb-4",
        isAssistant ? "justify-start" : "justify-end"
      )}
    >
      <div
        className={cn(
          "flex max-w-[80%] gap-3 items-end",
          isAssistant ? "flex-row" : "flex-row-reverse"
        )}
      >
        <div 
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-1",
            isAssistant ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {isAssistant ? <Bot size={16} /> : <User size={16} />}
        </div>
        
        <div
          className={cn(
            "relative px-4 py-3 rounded-2xl shadow-sm text-sm",
            isAssistant 
              ? "bg-white dark:bg-[#1d232a] text-foreground rounded-bl-none border border-border/50" 
              : "bg-primary text-primary-foreground rounded-br-none"
          )}
        >
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </div>
          <div
            className={cn(
              "text-[9px] mt-1.5 flex justify-end font-medium opacity-70",
              isAssistant ? "text-muted-foreground" : "text-primary-foreground/90"
            )}
          >
            {format(message.timestamp, 'hh:mm a')}
          </div>
          
          {/* Bubble Tail */}
          <div 
            className={cn(
              "absolute bottom-0 w-2 h-2",
              isAssistant 
                ? "-left-1 border-l border-b border-border/50 bg-inherit" 
                : "-right-1 bg-inherit"
            )}
            style={{ clipPath: isAssistant ? 'polygon(100% 0, 100% 100%, 0 100%)' : 'polygon(0 0, 0 100%, 100% 100%)' }}
          />
        </div>
      </div>
    </div>
  );
}
