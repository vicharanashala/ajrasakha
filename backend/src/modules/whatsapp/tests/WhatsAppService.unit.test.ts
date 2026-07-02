import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import axios from 'axios';
import {
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
} from 'routing-controllers';
import {appConfig} from '#root/config/app.js';
import {WhatsAppService} from '../services/WhatsAppService.js';

vi.mock('axios');

describe('WhatsAppService', () => {
  let service: WhatsAppService;

  const mockUserRepository = {
    findById: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    service = new WhatsAppService(mockUserRepository as any);
  });

  describe('getThreads', () => {
    it('returns latest unique threads', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          threads: [
            {
              thread_id: '919999999999',
              metadata: {
                thread_name: 'First',
              },
              updated_at: '2025-01-01T10:00:00Z',
            },
            {
              thread_id: '919999999999',
              metadata: {
                thread_name: 'Latest',
              },
              updated_at: '2025-01-02T10:00:00Z',
            },
            {
              thread_id: '918888888888-2025-01-03',
              metadata: {
                thread_name: 'Second',
              },
              updated_at: '2025-01-03T10:00:00Z',
            },
          ],
        },
      } as any);

      const result = await service.getThreads();

      expect(result).toHaveLength(2);

      expect(result[0].phoneNumber).toBe('919999999999');
      expect(result[0].lastMessage).toBe('Latest');

      expect(result[1].phoneNumber).toBe('918888888888');
    });

    it('filters invalid threads', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          threads: [
            {
              thread_id: 'abc',
              metadata: {},
              updated_at: null,
            },
            {
              thread_id: '123',
              metadata: {
                thread_name: 'bad',
              },
              updated_at: '2025-01-01',
            },
          ],
        },
      } as any);

      const result = await service.getThreads();

      expect(result).toEqual([]);
    });

    it('uses default message when thread_name is missing', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          threads: [
            {
              thread_id: '919999999999',
              metadata: {
                someKey: 'value',
              },
              updated_at: '2025-01-01T10:00:00Z',
            },
          ],
        },
      } as any);

      const result = await service.getThreads();

      expect(result).toHaveLength(1);
      expect(result[0].lastMessage).toBe('No message available');
    });

    it('throws InternalServerError when request fails', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network Error'));

      await expect(service.getThreads()).rejects.toThrow(
        'Failed to fetch threads from LangGraph',
      );
    });
  });
  describe('getThreadDetails', () => {
    it('returns formatted conversation with tool responses', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          created_at: '2025-01-01T10:00:00Z',
          values: {
            messages: [
              {
                id: '1',
                type: 'human',
                content: 'My crop has yellow leaves',
              },
              {
                type: 'tool',
                tool_call_id: 'tool-1',
                artifact: {
                  structured_content: {
                    result: {
                      diagnosis: 'Nitrogen deficiency',
                    },
                  },
                },
              },
              {
                id: '2',
                type: 'ai',
                content: 'Use urea.',
                tool_calls: [
                  {
                    id: 'tool-1',
                    name: 'crop_search',
                    args: {
                      crop: 'Wheat',
                    },
                  },
                ],
              },
            ],
          },
        },
      } as any);

      const result = await service.getThreadDetails(
        '919999999999',
        '2025-01-01',
      );

      expect(result).toHaveLength(2);

      expect(result[0]).toMatchObject({
        role: 'user',
        content: 'My crop has yellow leaves',
      });

      expect(result[1]).toMatchObject({
        role: 'assistant',
        content: 'Use urea.',
      });

      expect(result[1].toolCalls).toEqual([
        {
          id: 'tool-1',
          name: 'crop_search',
          args: {
            crop: 'Wheat',
          },
          response: {
            diagnosis: 'Nitrogen deficiency',
          },
        },
      ]);
    });
    it('formats AI messages with array content', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          created_at: '2025-01-01T10:00:00Z',
          values: {
            messages: [
              {
                id: '1',
                type: 'ai',
                content: [
                  {
                    type: 'text',
                    text: 'First line',
                  },
                  {
                    type: 'text',
                    text: 'Second line',
                  },
                  {
                    type: 'image',
                    url: 'ignored',
                  },
                ],
              },
            ],
          },
        },
      } as any);

      const result = await service.getThreadDetails(
        '919999999999',
        '2025-01-01',
      );

      expect(result).toHaveLength(1);

      expect(result[0]).toMatchObject({
        role: 'assistant',
        content: 'First line\nSecond line',
      });
    });
    it('creates assistant message when only tool calls exist', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          created_at: '2025-01-01T10:00:00Z',
          values: {
            messages: [
              {
                type: 'tool',
                tool_call_id: 'tool-1',
                artifact: {
                  structured_content: {
                    result: {
                      success: true,
                    },
                  },
                },
              },
              {
                id: '2',
                type: 'ai',
                content: '',
                tool_calls: [
                  {
                    id: 'tool-1',
                    name: 'search_crop',
                    args: {
                      crop: 'Rice',
                    },
                  },
                ],
              },
            ],
          },
        },
      } as any);

      const result = await service.getThreadDetails(
        '919999999999',
        '2025-01-01',
      );

      expect(result).toHaveLength(1);

      expect(result[0]).toMatchObject({
        role: 'assistant',
        content: 'Executing tools...',
      });

      expect(result[0].toolCalls).toEqual([
        {
          id: 'tool-1',
          name: 'search_crop',
          args: {
            crop: 'Rice',
          },
          response: {
            success: true,
          },
        },
      ]);
    });
    it('throws NotFoundError when thread does not exist', async () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      vi.mocked(axios.get).mockRejectedValue({
        response: {
          status: 404,
        },
      });

      await expect(
        service.getThreadDetails('919999999999', '2025-01-01'),
      ).rejects.toThrow(NotFoundError);
    });
    it('throws InternalServerError when LangGraph returns 500', async () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      vi.mocked(axios.get).mockRejectedValue({
        response: {
          status: 500,
        },
      });

      await expect(
        service.getThreadDetails('919999999999', '2025-01-01'),
      ).rejects.toThrow('LangGraph service is currently unavailable');
    });
    it('throws InternalServerError when unable to connect to LangGraph', async () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      vi.mocked(axios.get).mockRejectedValue({});

      await expect(
        service.getThreadDetails('919999999999', '2025-01-01'),
      ).rejects.toThrow('Unable to connect to LangGraph service');
    });
    it('throws fallback InternalServerError for unknown errors', async () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      vi.mocked(axios.get).mockRejectedValue(new Error('Something went wrong'));

      await expect(
        service.getThreadDetails('919999999999', '2025-01-01'),
      ).rejects.toThrow('Failed to fetch thread details for 919999999999');
    });
  });
  describe('sendMessage', () => {
    it('sends message successfully', async () => {
      mockUserRepository.findById.mockResolvedValue({
        _id: 'user-id',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
      });

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json'),
        },
        json: vi.fn().mockResolvedValue({
          success: true,
        }),
      });

      vi.stubGlobal('fetch', fetchSpy);

      await expect(
        service.sendMessage('user-id', '919999999999', 'Hello Farmer'),
      ).resolves.toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      expect(fetchSpy).toHaveBeenCalledWith(
        appConfig.WA_SEND_MESSAGE_WEBHOOK_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-api-key': appConfig.WA_WEBHOOK_API_KEY,
          },
          body: JSON.stringify({
            phoneNumber: '919999999999',
            messageText: 'Hello Farmer',
            sendBy: 'John Doe',
            userId: 'user-id',
          }),
        },
      );
    });

    it('throws when user does not exist', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(
        service.sendMessage('user-id', '919999999999', 'Hello'),
      ).rejects.toThrow(
        "WhatsApp API Error: You don't have permission to send message!",
      );
    });

    it('throws when user is expert', async () => {
      mockUserRepository.findById.mockResolvedValue({
        _id: 'user-id',
        firstName: 'John',
        lastName: 'Doe',
        role: 'expert',
      });

      await expect(
        service.sendMessage('user-id', '919999999999', 'Hello'),
      ).rejects.toThrow(
        "WhatsApp API Error: You don't have permission to send message!",
      );
    });
    it('throws when webhook returns an error response', async () => {
      mockUserRepository.findById.mockResolvedValue({
        _id: 'user-id',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          headers: {
            get: vi.fn().mockReturnValue('application/json'),
          },
          json: vi.fn().mockResolvedValue({
            message: 'Webhook failed',
          }),
        }),
      );

      await expect(
        service.sendMessage('user-id', '919999999999', 'Hello Farmer'),
      ).rejects.toThrow(
        'WhatsApp API Error: Failed to send message: 500 - [object Object]',
      );
    });
    it('throws when webhook returns text error', async () => {
      mockUserRepository.findById.mockResolvedValue({
        _id: 'user-id',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          headers: {
            get: vi.fn().mockReturnValue('text/plain'),
          },
          text: vi.fn().mockResolvedValue('Internal Error'),
        }),
      );

      await expect(
        service.sendMessage('user-id', '919999999999', 'Hello Farmer'),
      ).rejects.toThrow(
        'WhatsApp API Error: Failed to send message: 500 - Internal Error',
      );
    });
    it('throws when webhook request fails', async () => {
      mockUserRepository.findById.mockResolvedValue({
        _id: 'user-id',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(
        service.sendMessage('user-id', '919999999999', 'Hello Farmer'),
      ).rejects.toThrow('WhatsApp API Error: Network Error');
    });
  });
  describe('getInactiveUsers', () => {
    it('returns paginated inactive users', async () => {
      const response = {
        users: [
          {
            phoneNumber: '919999999999',
            name: 'John',
          },
        ],
        total: 1,
      };

      vi.mocked(axios.get).mockResolvedValue({
        data: response,
      } as any);

      const result = await service.getInactiveUsers(0, 10);

      expect(result).toEqual(response);

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/whatsapp/users'),
        {
          params: {
            isPaginated: true,
            skip: 0,
            limit: 10,
          },
          headers: {
            'x-internal-api-key': expect.any(String),
          },
        },
      );
    });

    it('throws InternalServerError when request fails', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network Error'));

      await expect(service.getInactiveUsers(0, 10)).rejects.toThrow(
        'Failed to fetch inactive WhatsApp users',
      );
    });
  });
  describe('getAllUsers', () => {
    it('returns all WhatsApp users', async () => {
      const response = {
        users: [
          {
            phoneNumber: '919999999999',
            name: 'John',
          },
          {
            phoneNumber: '918888888888',
            name: 'Jane',
          },
        ],
        total: 2,
      };

      vi.mocked(axios.get).mockResolvedValue({
        data: response,
      } as any);

      const result = await service.getAllUsers();

      expect(result).toEqual(response);

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/whatsapp/users'),
        {
          params: {
            isPaginated: false,
          },
          headers: {
            'x-internal-api-key': expect.any(String),
          },
        },
      );
    });

    it('throws InternalServerError when request fails', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network Error'));

      await expect(service.getAllUsers()).rejects.toThrow(
        'Failed to fetch inactive WhatsApp users',
      );
    });
  });
  describe('getUniqueUsers', () => {
    it('returns unique users count', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          uniqueUserCount: 42,
        },
      } as any);

      const result = await service.getUniqueUsers();

      expect(result).toBe(42);

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/whatsapp/users/count'),
        {
          params: {
            isPaginated: false,
          },
          headers: {
            'x-internal-api-key': expect.any(String),
          },
        },
      );
    });

    it('throws InternalServerError when request fails', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network Error'));

      await expect(service.getUniqueUsers()).rejects.toThrow(
        'Failed to fetch inactive WhatsApp users',
      );
    });
  });
});
