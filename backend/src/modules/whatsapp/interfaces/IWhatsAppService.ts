import { WhatsappUser, WhatsappUsersResponse } from "#root/shared/index.js";

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
  lastMessageDate?: string;
  unreadCount?: number;
}

export interface IWhatsAppService {
  getThreads(): Promise<Thread[]>;
  getThreadDetails(phoneNumber: string, date: string): Promise<Message[]>;
  sendMessage(
    userId: string,
    phoneNumber: string,
    messageText: string,
  ): Promise<void>;
  getInactiveUsers(skip: number, limit: number): Promise<WhatsappUsersResponse>;
  getAllUsers(): Promise<WhatsappUsersResponse>;
  getUniqueUsers(): Promise<number>;
}
