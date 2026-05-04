// Core types for WhatsApp History feature
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface Thread {
  id: string;
  phoneNumber: string;
  lastMessage: string;
  lastMessageTimestamp: Date;
  unreadCount?: number;
}

export const WH_TYPES = true; // Dummy value to ensure module is not empty
