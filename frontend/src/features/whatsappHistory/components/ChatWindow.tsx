import { useEffect, useRef, useState } from 'react';
import type { Message, Thread } from '../types';
import { ChatMessage } from './ChatMessage';
import { Phone, Info, MoreVertical, Check, MessageCircle, Send, AlertCircle, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/atoms/button';
import { formatPhoneNumber } from '@/utils/formatPhoneNumber';
import { ScrollArea } from '@/components/atoms/scroll-area';
import { Textarea } from '@/components/atoms/textarea';
import { cn } from '@/lib/utils';

interface ChatWindowProps {
  selectedThread?: Thread;
  messages: Message[];
  isLoading?: boolean;
  onSendMessage?: (content: string) => void;
  canSendMessage?: boolean;
  isSending?: boolean;
}

export function ChatWindow({
  selectedThread,
  messages,
  isLoading,
  onSendMessage,
  canSendMessage = false,
  isSending = false
}: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (message.trim() && onSendMessage && canSendMessage) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isLoading]);
  if (!selectedThread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 gap-0 p-8">

        {/* Icon */}
        <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 flex items-center justify-center mb-5">
          <MessageCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>

        {/* Copy */}
        <p className="text-sm font-medium text-foreground mb-1.5">No conversation selected</p>
        <p className="text-xs text-muted-foreground text-center max-w-[200px] leading-relaxed mb-6">
          Pick a thread from the sidebar to view its AI response history.
        </p>

        {/* Skeleton thread list hint */}
        <div className="flex flex-col gap-2 w-48">
          {[80, 65, 70].map((w, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${i === 1
                ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                : "bg-card border-border"
                }`}
            >
              <div className={`w-6 h-6 rounded-full flex-shrink-0 ${i === 1 ? "bg-green-200 dark:bg-green-800" : "bg-muted"
                }`} />
              <div className="flex-1 space-y-1">
                <div className={`h-2 rounded-full ${i === 1 ? "bg-green-200 dark:bg-green-800" : "bg-muted"
                  }`} style={{ width: `${w}%` }} />
                <div className={`h-1.5 rounded-full opacity-60 ${i === 1 ? "bg-green-200 dark:bg-green-800" : "bg-muted"
                  }`} style={{ width: `${w - 25}%` }} />
              </div>
              {i === 1 && (
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Check className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border bg-card flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-green-50 dark:bg-green-950 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-green-700 dark:text-green-300">
              +{selectedThread.phoneNumber.slice(0, 2)}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-none">
              {formatPhoneNumber(selectedThread.phoneNumber)}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-green-600 dark:text-green-400">
                WhatsApp thread
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            {/* <Info className="h-4 w-4" /> */}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            {/* <MoreVertical className="h-4 w-4" /> */}
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 px-4">
        <div className="flex flex-col gap-3 py-4">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-7 w-7 border-2 border-muted border-t-green-500" />
            </div>
          ) : messages.length > 0 ? (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          ) : (
            <div className="text-center text-muted-foreground text-sm p-8">
              No messages found in this thread.
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer / Message Input */}
      <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
        {canSendMessage ? (
          <div className="flex flex-col gap-2">
            <div className="relative flex items-end gap-2 bg-background/50 rounded-xl border border-border p-1.5 focus-within:ring-2 focus-within:ring-green-500/20 focus-within:border-green-500/50 transition-all">
              <Textarea
                placeholder="Type a message..."
                className="flex-1 min-h-[44px] max-h-[120px] bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-2.5 px-3 text-sm"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
              />
              <Button
                size="icon"
                className={cn(
                  "h-9 w-9 rounded-lg shrink-0 transition-all",
                  message.trim() ? "bg-green-600 hover:bg-green-700 text-white" : "bg-muted text-muted-foreground"
                )}
                disabled={!message.trim() || isSending}
                onClick={handleSend}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex items-center justify-center gap-1.5 px-1">
              <Info className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              <p className="text-[10px] text-muted-foreground/70 leading-snug">
                This will send a direct WhatsApp message to the user.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 px-6 bg-muted/20 rounded-xl border border-dashed border-border/60">
            <div className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center mb-3 shadow-sm">
              <Lock className="h-4 w-4 text-muted-foreground" />
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Standard Messaging Disabled</h4>
            <p className="text-[11px] text-muted-foreground text-center max-w-[320px] leading-relaxed">
              The 24-hour window since the user's last message has expired. 
              WhatsApp requires a <strong>Message Template</strong> to continue the conversation.
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="h-8 text-[10px] font-medium px-3 opacity-50 cursor-not-allowed">
                Choose Template
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}