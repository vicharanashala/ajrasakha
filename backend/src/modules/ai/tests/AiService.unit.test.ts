import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {InternalServerError} from 'routing-controllers';

import {AiService} from '../services/AiService.js';

describe('AiService', () => {
  let service: AiService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new AiService();
  });

  describe('getQuestionByContext', () => {
    it('returns questions when AI server responds successfully', async () => {
      const response = {
        questions: [
          {
            questionId: 'q1',
            score: 0.95,
            question: 'What is wheat?',
          },
        ],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(response),
        }),
      );

      const result = await service.getQuestionByContext('wheat');

      expect(result).toEqual(response);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'wheat',
          top_k: 5,
          threshold: 0.8,
        }),
      });
    });

    it('throws InternalServerError when AI server returns non-200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Bad Request',
        }),
      );

      await expect(service.getQuestionByContext('wheat')).rejects.toThrow(
        InternalServerError,
      );
    });

    it('throws fetch error when request fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(service.getQuestionByContext('wheat')).rejects.toThrow(
        'Network Error',
      );
    });

    it('passes empty query to AI server', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            questions: [],
          }),
        }),
      );

      await service.getQuestionByContext('');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            query: '',
            top_k: 5,
            threshold: 0.8,
          }),
        }),
      );
    });
  });

  describe('getQuestionByContextAndMetaData', () => {
    it('returns matching questions successfully', async () => {
      const response = {
        questions: [
          {
            questionId: 'q1',
            score: 0.94,
          },
        ],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(response),
        }),
      );

      const metadata = {
        crop: 'Wheat',
        state: 'Punjab',
        district: 'Ludhiana',
      };

      const result = await service.getQuestionByContextAndMetaData(
        'yellow leaves',
        'Punjab',
        'Ludhiana',
        'Wheat',
      );

      expect(result).toEqual(response);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/search'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'yellow leaves',
          top_k: 3,
          threshold: 0.85,
          state: 'Punjab',
          crop: 'Wheat',
        }),
      });
    });

    it('throws InternalServerError when AI server returns error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: 'Internal Server Error',
        }),
      );

      await expect(
        service.getQuestionByContextAndMetaData(
          'yellow leaves',
          'Punjab',
          'Ludhiana',
          'Wheat',
        ),
      ).rejects.toThrow(InternalServerError);
    });

    it('propagates fetch errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network Error')),
      );

      await expect(
        service.getQuestionByContextAndMetaData(
          'yellow leaves',
          'Punjab',
          'Ludhiana',
          'Wheat',
        ),
      ).rejects.toThrow('Network Error');
    });

    it('sends empty optional fields', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            questions: [],
          }),
        }),
      );

      await service.getQuestionByContextAndMetaData('query');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            query: 'query',
            top_k: 3,
            threshold: 0.85,
            state: undefined,
            crop: undefined,
          }),
        }),
      );
    });
  });
});
