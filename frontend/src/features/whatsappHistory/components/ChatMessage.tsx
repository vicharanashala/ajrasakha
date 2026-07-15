import { format } from 'date-fns';
import { useState } from 'react';
import type { Message } from '../types';
import { cn } from '@/lib/utils';
import { Bot, User, ChevronDown, ChevronUp, Terminal, Clock, Check, AlertCircle, CheckCheck } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === 'assistant';
  const [isExpanded, setIsExpanded] = useState(false);

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
        {/* Avatar */}
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-1 border",
            isAssistant
              ? "bg-secondary text-secondary-foreground border-border"
              : "bg-primary text-primary-foreground border-primary"
          )}
        >
          {isAssistant ? <Bot size={16} /> : <User size={16} />}
        </div>

        {/* Bubble */}
        <div
          className={cn(
            "relative px-4 py-3 rounded-lg shadow-sm text-sm border",
            isAssistant
              ? "bg-card text-card-foreground border-border rounded-bl-sm"
              : "bg-primary text-primary-foreground border-primary rounded-br-sm"
          )}
        >
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </div>

          {isAssistant && message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center justify-between w-full group/btn hover:bg-muted px-2 py-1.5 rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-muted text-muted-foreground">
                    <Terminal size={12} />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground group-hover/btn:text-foreground transition-colors">
                    View Process ({message.toolCalls.length})
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp size={14} className="text-muted-foreground" />
                ) : (
                  <ChevronDown size={14} className="text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {message.toolCalls.map((tool, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-border bg-background overflow-hidden"
                    >
                      {/* Tool Header */}
                      <div className="flex items-center justify-between px-3 py-2 bg-muted border-b border-border">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-foreground/60" />
                          <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                            {tool.name.replace(/_/g, " ")}
                          </span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono border border-border">
                          {tool.id?.slice(-6) || "N/A"}
                        </span>
                      </div>

                      <div className="p-2.5 space-y-2.5">
                        {/* Arguments */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <div className="h-px w-2 bg-border" />
                            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Input Arguments
                            </span>
                          </div>
                          <div className="rounded-md bg-muted/40 border border-border p-2 overflow-x-auto custom-scrollbar">
                            <pre className="text-[10px] font-mono text-foreground/80 leading-tight">
                              {JSON.stringify(tool.args, null, 2)}
                            </pre>
                          </div>
                        </div>

                        {/* Response */}
                        {tool.response && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <div className="h-px w-2 bg-border" />
                              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                                Tool Response
                              </span>
                            </div>
                            <div className="rounded-md bg-muted/40 border border-border p-2 overflow-x-auto custom-scrollbar max-h-48 overflow-y-auto">
                              <pre className="text-[10px] font-mono text-foreground/80 leading-tight whitespace-pre-wrap">
                                {typeof tool.response === "object"
                                  ? JSON.stringify(tool.response, null, 2)
                                  : String(tool.response)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            className={cn(
              "text-[9px] mt-1.5 flex justify-end items-center gap-1 font-medium opacity-70",
              isAssistant ? "text-muted-foreground" : "text-primary-foreground"
            )}
          >
            {format(message.timestamp, "hh:mm a")}
            {isAssistant && message.status === 'sending' && (
              <Clock size={10} className="animate-pulse" />
            )}
            {isAssistant && message.status === 'error' && (
              <AlertCircle size={10} className="text-destructive" />
            )}
            {isAssistant && !message.status && message.id?.startsWith('temp-') && (
              <Check size={10} />
            )}
            {isAssistant && !message.id?.startsWith('temp-') && message.role === 'assistant' && (
              <CheckCheck size={12} className="text-green-500" />
            )}
          </div>
        </div>
      </div>
    </div>

  );
}
