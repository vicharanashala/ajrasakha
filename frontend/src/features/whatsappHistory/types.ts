// Core types for WhatsApp History feature
export interface ToolCall {
  name: string;
  args: Record<string, any>;
  id?: string;
  response?: any;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

export interface Thread {
  id: string;
  phoneNumber: string;
  lastMessage: string;
  lastMessageTimestamp: Date;
  unreadCount?: number;
}
