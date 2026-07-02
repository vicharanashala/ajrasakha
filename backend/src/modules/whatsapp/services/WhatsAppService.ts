import axios from 'axios';
import { appConfig } from '#root/config/app.js';
import type { IWhatsAppService, Thread, Message, ToolCall } from '../interfaces/IWhatsAppService.js';
import { InternalServerError, NotFoundError, UnauthorizedError } from 'routing-controllers';
import { aiConfig } from '#root/config/ai.js';
import { IUserRepository } from '#root/shared/database/interfaces/IUserRepository.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { inject, injectable } from 'inversify';
import { WhatsappUser, WhatsappUsersResponse } from '#root/shared/index.js';

@injectable()
export class WhatsAppService implements IWhatsAppService {
  constructor(
    @inject(GLOBAL_TYPES.UserRepository)
    private readonly userRepo: IUserRepository,
  ) {}
  // private readonly baseUrl = aiConfig.serverIP;
  private readonly baseUrl =
    'http://' + aiConfig.serverIP + ':' + aiConfig.whatsAppServerPort;
  private readonly WHATSAPP_SERVER_URL = aiConfig.WHATSAPP_SERVER_URL;
  private readonly WA_WEBHOOK_API_KEY = appConfig.WA_WEBHOOK_API_KEY;

  async getThreads(): Promise<Thread[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/threads`);
      const data = response.data;

      // const threads: Thread[] = (data.threads as any[])
      //   .filter((t: any) =>
      //     /^\d{12}$/.test(t.thread_id) &&
      //     t.metadata &&
      //     Object.keys(t.metadata).length > 0 &&
      //     t.updated_at !== null
      //   )
      //   .map((t: any) => ({
      //     id: t.thread_id,
      //     phoneNumber: t.thread_id,
      //     lastMessage: t.metadata.thread_name || 'No message available',
      //     lastMessageTimestamp: new Date(t.updated_at),
      //     unreadCount: 0,
      //   }));
      const uniqueThreadsMap = new Map<string, Thread>();

      (data.threads as any[])
        .filter(
          (t: any) =>
            /^\d{12}(-\d{4}-\d{2}-\d{2})?$/.test(t.thread_id) &&
            t.metadata &&
            Object.keys(t.metadata).length > 0 &&
            t.updated_at !== null,
        )
        .forEach((t: any) => {
          const phoneNumber = t.thread_id.split('-')[0];

          // Keep latest updated thread for each phone number
          const existing = uniqueThreadsMap.get(phoneNumber);

          if (
            !existing ||
            new Date(t.updated_at) > existing.lastMessageTimestamp
          ) {
            let lastMessageDate = '';
            if (t.thread_id.includes('-')) {
              lastMessageDate = t.thread_id.split('-').slice(1).join('-');
            } else {
              lastMessageDate = new Date(t.updated_at).toLocaleDateString(
                'en-CA',
                {timeZone: 'Asia/Kolkata'},
              );
            }

            uniqueThreadsMap.set(phoneNumber, {
              id: phoneNumber,
              phoneNumber,
              lastMessage: t.metadata.thread_name || 'No message available',
              lastMessageTimestamp: new Date(t.updated_at),
              lastMessageDate,
              unreadCount: 0,
            });
          }
        });

      const threads: Thread[] = Array.from(uniqueThreadsMap.values());

      return threads;
    } catch (error) {
      console.error('Error fetching threads from LangGraph:', error);
      throw new InternalServerError('Failed to fetch threads from LangGraph');
    }
  }

  async getThreadDetails(
    phoneNumber: string,
    date: string,
  ): Promise<Message[]> {
    try {
      let threadId = phoneNumber;
      if (!threadId.includes('-')) {
        threadId = `${phoneNumber}-${date}`;
      }

      const response = await axios.get(
        `${this.baseUrl}/threads/${threadId}/state`,
      );
      const data = response.data;

      const messages = (data.values?.messages as any[]) || [];
      const formattedMessages: Message[] = [];

      // 1. First, map all tool responses in the entire thread
      const toolResponsesMap: Record<string, any> = {};
      messages.forEach((msg: any) => {
        if (msg.type === 'tool') {
          let response =
            msg.artifact?.structured_content?.result || msg.content;
          if (typeof response === 'string' && response.startsWith('{')) {
            try {
              response = JSON.parse(response);
            } catch (e) {}
          }
          toolResponsesMap[msg.tool_call_id] = response;
        }
      });

      // 2. Iterate through all messages to build the conversation
      messages.forEach((msg: any, idx: number) => {
        if (msg.type === 'human') {
          formattedMessages.push({
            id: msg.id || `h-${idx}`,
            role: 'user',
            content: typeof msg.content === 'string' ? msg.content : '',
            timestamp: new Date(data.created_at || Date.now()),
          });
        } else if (msg.type === 'ai') {
          const toolCalls: ToolCall[] =
            msg.tool_calls?.map((tc: any) => ({
              name: tc.name,
              args: tc.args,
              id: tc.id,
              response: toolResponsesMap[tc.id],
            })) || [];

          // Only add AI message if it has content OR tool calls
          const content =
            typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text)
                    .join('\n')
                : '';

          if (content || toolCalls.length > 0) {
            formattedMessages.push({
              id: msg.id || `a-${idx}`,
              role: 'assistant',
              content:
                content || (toolCalls.length > 0 ? 'Executing tools...' : ''),
              timestamp: new Date(data.created_at || Date.now()),
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            });
          }
        }
      });

      return formattedMessages;
    } catch (error: any) {
      // Thread not found
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundError(
          `No thread history found for ${phoneNumber} on ${date}`,
        );
      }

      // LangGraph server errors
      if (axios.isAxiosError(error) && error.response?.status >= 500) {
        throw new InternalServerError(
          `LangGraph service is currently unavailable`,
        );
      }

      // Network / connection issues
      if (axios.isAxiosError(error) && !error.response) {
        throw new InternalServerError(`Unable to connect to LangGraph service`);
      }

      // Fallback
      throw new InternalServerError(
        `Failed to fetch thread details for ${phoneNumber}`,
      );
    }
  }

  async sendMessage(
    userId: string,
    phoneNumber: string,
    messageText: string,
  ): Promise<void> {
    try {
      console.log('[WhatsAppService] sendMessage called with:', {
        userId,
        phoneNumber,
        messageText,
      });

      const user = await this.userRepo.findById(userId);
      console.log('[WhatsAppService] User found:', user ? user._id : 'null');

      if (!user || user.role == 'expert')
        throw new UnauthorizedError(
          "You don't have permission to send message!",
        );

      const sendBy = user.firstName + ' ' + user.lastName;

      const webhookUrl = appConfig.WA_SEND_MESSAGE_WEBHOOK_API_URL;
      console.log('[WhatsAppService] Webhook URL:', webhookUrl);
      console.log('[WhatsAppService] Webhook API Key configured:', !!appConfig.WA_WEBHOOK_API_KEY);

      const payload = {
        phoneNumber,
        messageText,
        sendBy,
        userId: user._id.toString(),
      };
      console.log('[WhatsAppService] Sending payload to webhook:', payload);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-api-key': appConfig.WA_WEBHOOK_API_KEY,
        },
        body: JSON.stringify(payload),
      });

      console.log('[WhatsAppService] Webhook response status:', response.status);
      console.log('[WhatsAppService] Webhook response ok:', response.ok);

      const contentType = response.headers.get('content-type');
      console.log('[WhatsAppService] Response content-type:', contentType);

      let responseData;

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      console.log('[WhatsAppService] Webhook response data:', responseData);

      if (!response.ok) {
        throw new Error(
          `Failed to send message: ${response.status} - ${responseData}`,
        );
      }

      console.log('[WhatsAppService] Message sent successfully via webhook');
    } catch (error: any) {
      console.error(
        `[WhatsAppService] Error sending WhatsApp message to ${phoneNumber}:`,
        error.response?.data || error.message,
      );
      console.error('[WhatsAppService] Full error:', error);
      const detail = error.response?.data?.message || error.message;
      throw new InternalServerError(`WhatsApp API Error: ${detail}`);
    }
  }

  async getInactiveUsers(
    skip: number,
    limit: number,
  ): Promise<WhatsappUsersResponse> {

    try {
      const response = await axios.get(`${this.WHATSAPP_SERVER_URL}/whatsapp/users`, {
        params: {
          isPaginated: true,
          skip,
          limit,
        },
        headers: {
          'x-internal-api-key': this.WA_WEBHOOK_API_KEY,
        },
      });

      const usersResponse = response.data as WhatsappUsersResponse;

      return usersResponse;    
      } catch (error) {
      console.error('Error fetching inactive WhatsApp users:', error);

      throw new InternalServerError('Failed to fetch inactive WhatsApp users');
    }
  }

  async getAllUsers(): Promise<WhatsappUsersResponse> {
    try {
      const response = await axios.get(`${this.WHATSAPP_SERVER_URL}/whatsapp/users`, {
        params: {
          isPaginated: false,
        },
        headers: {
          'x-internal-api-key': this.WA_WEBHOOK_API_KEY,
        },
      });

      const usersResponse = response.data as WhatsappUsersResponse;

      return usersResponse;    
      } catch (error) {
      console.error('Error fetching inactive WhatsApp users:', error);

      throw new InternalServerError('Failed to fetch inactive WhatsApp users');
    }
  }

  async getUniqueUsers(): Promise<number> {
    try {
      const response = await axios.get(`${this.WHATSAPP_SERVER_URL}/whatsapp/users/count`, {
        params: {
          isPaginated: false,
        },
        headers: {
          'x-internal-api-key': this.WA_WEBHOOK_API_KEY,
        },
      });

      const uniqueUsersCount = response.data.uniqueUserCount;

      return uniqueUsersCount;    
      } catch (error) {
      console.error('Error fetching inactive WhatsApp users:', error);

      throw new InternalServerError('Failed to fetch inactive WhatsApp users');
    }
  }
}
