import type { Message, Thread } from '../types';
import { ChatMessage } from './ChatMessage';
import { Phone, Info } from 'lucide-react';
import { Button } from '@/components/atoms/button';

interface ChatWindowProps {
  selectedThread?: Thread;
  messages: Message[];
  isLoading?: boolean;
}

export function ChatWindow({ selectedThread, messages, isLoading }: ChatWindowProps) {
  if (!selectedThread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 text-muted-foreground p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Phone className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-medium">No conversation selected</h3>
        <p className="text-sm max-w-xs mt-2">
          Select a thread from the left panel to view the AI response history.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="font-bold text-primary">+{selectedThread.phoneNumber.slice(-2)}</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">+{selectedThread.phoneNumber}</h3>
            <span className="text-[10px] text-green-500 font-medium">WhatsApp Thread</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#f0f2f5] dark:bg-[#0b141a]">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length > 0 ? (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          ) : isLoading ? (
            <div className="flex justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground p-8">
              No messages found in this thread.
            </div>
          )}
        </div>
      </div>
      
      {/* Footer / Info */}
      <div className="p-3 border-t border-border bg-card text-center text-[10px] text-muted-foreground shrink-0">
        Showing final AI responses. Tool calls and technical logs are hidden for readability.
      </div>
    </div>
  );
}
