import { Search, Home, MoreVertical, MessageCircle, ChevronLeft, Calendar as CalendarIcon, X } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Input } from '@/components/atoms/input';
import { ThreadItem } from './ThreadItem';
import type { Thread } from '../types';
import { Separator } from '@/components/atoms/separator';
import { ScrollArea } from '@/components/atoms/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/atoms/popover';
import { Calendar } from '@/components/atoms/calendar';
import { Button } from '@/components/atoms/button';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ThreadSidebarProps {
  threads: Thread[];
  selectedThreadId?: string;
  onThreadSelect: (threadId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedDate?: Date;
  onDateChange: (date: Date | undefined) => void;
  isLoading?: boolean;
}

export function ThreadSidebar({
  threads,
  selectedThreadId,
  onThreadSelect,
  searchQuery,
  onSearchChange,
  selectedDate,
  onDateChange,
  isLoading,
}: ThreadSidebarProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full border-r border-border bg-card w-80 shrink-0">
      {/* Back navigation */}
      <div className="px-3 pt-3">
        <button
          onClick={() => navigate({ to: '/home' })}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to home
        </button>
      </div>

      {/* Header */}
      <div className="px-4 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-none">WhatsApp</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{threads.length} conversations</p>
            </div>
          </div>
          <button className="p-1.5 hover:bg-accent rounded-full transition-colors text-muted-foreground">
            {/* <MoreVertical className="h-4 w-4" /> */}
          </button>
        </div>

        <div className="flex flex-col gap-2 mb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search threads..."
              className="pl-8 h-8 text-sm bg-muted/50"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 justify-start text-left font-normal flex-1 bg-muted/30 border-dashed",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {selectedDate ? format(selectedDate, "PPP") : <span>Filter by date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={onDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {selectedDate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onDateChange(undefined)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Thread list */}
      <ScrollArea className="flex-1 w-full overflow-hidden">
        <div className="w-full flex flex-col">
          {isLoading ? (
            <div className="flex flex-col">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-4 border-b border-border/50 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-2 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length > 0 ? (
            threads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={selectedThreadId === thread.id}
                onClick={() => onThreadSelect(thread.id)}
              />
            ))
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No threads found
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
