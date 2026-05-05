import { injectable } from 'inversify';
import axios from 'axios';
import { appConfig } from '#root/config/app.js';
import type { IWhatsAppService, Thread, Message, ToolCall } from '../interfaces/IWhatsAppService.js';
import { InternalServerError } from 'routing-controllers';

@injectable()
export class WhatsAppService implements IWhatsAppService {
  private readonly baseUrl = appConfig.langGraphUrl;

  async getThreads(): Promise<Thread[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/threads`);
      const data = response.data;

      const threads: Thread[] = (data.threads as any[])
        .filter((t: any) => /^\d{12}$/.test(t.thread_id))
        .map((t: any) => ({
          id: t.thread_id,
          phoneNumber: t.thread_id,
          lastMessage: t.metadata.thread_name || 'No message available',
          lastMessageTimestamp: new Date(t.updated_at),
          unreadCount: 0,
        }));

      return threads;
    } catch (error) {
      console.error('Error fetching threads from LangGraph:', error);
      throw new InternalServerError('Failed to fetch threads from LangGraph');
    }
  }

  async getThreadDetails(threadId: string): Promise<Message[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/threads/${threadId}/state`);
      const data = response.data;

      const messages = data.values.messages as any[];
      const formattedMessages: Message[] = [];

      // 1. First, map all tool responses in the entire thread
      const toolResponsesMap: Record<string, any> = {};
      messages.forEach((msg: any) => {
        if (msg.type === 'tool') {
          let response = msg.artifact?.structured_content?.result || msg.content;
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
              content: content || (toolCalls.length > 0 ? 'Executing tools...' : ''),
              timestamp: new Date(data.created_at || Date.now()),
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            });
          }
        }
      });

      return formattedMessages;
    } catch (error) {
      console.error(`Error fetching thread details for ${threadId} from LangGraph:`, error);
      throw new InternalServerError(`Failed to fetch thread details from LangGraph`);
    }
  }
}
