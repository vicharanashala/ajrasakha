import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import axios from 'axios';
import {InternalServerError} from 'routing-controllers';

import {AccAgentService} from '../services/AccAgentService.js';

vi.mock('axios');

describe('AccAgentService', () => {
  let service: AccAgentService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AccAgentService();
  });

  describe('createThread', () => {
    it('creates thread successfully', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          thread_id: 'thread-1',
        },
      } as any);

      const result = await service.createThread();

      expect(result).toEqual({
        thread_id: 'thread-1',
      });

      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('throws when thread id is missing', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {},
      } as any);

      await expect(service.createThread()).rejects.toThrow(InternalServerError);
    });

    it('throws when api request fails', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));

      await expect(service.createThread()).rejects.toThrow(
        'Failed to create ACC Agent thread',
      );
    });
  });
  describe('extractData', () => {
    it('returns extracted data', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          extracted_query: 'yellow leaves',
          extracted_crop: 'Rice',
          extracted_state: 'Punjab',
          extracted_district: 'Ludhiana',
        },
      } as any);

      const result = await service.extractData('thread-1', 'Farmer transcript');

      expect(result).toEqual({
        extracted_query: 'yellow leaves',
        extracted_crop: 'Rice',
        extracted_state: 'Punjab',
        extracted_district: 'Ludhiana',
      });

      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('throws when extracted_query is missing', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {},
      } as any);

      await expect(service.extractData('thread', 'text')).rejects.toThrow(
        'Failed to extract data from transcript using ACC Agent',
      );
    });

    it('throws when api request fails', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));

      await expect(service.extractData('thread', 'text')).rejects.toThrow(
        'Failed to extract data from transcript using ACC Agent',
      );
    });

    it('returns empty strings for optional fields', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          extracted_query: 'query',
        },
      } as any);

      const result = await service.extractData('thread', 'text');

      expect(result).toEqual({
        extracted_query: 'query',
        extracted_crop: '',
        extracted_state: '',
        extracted_district: '',
      });
    });
  });
  describe('updateState', () => {
    it('updates thread state successfully', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {},
      } as any);

      await expect(
        service.updateState('thread-1', {
          query: 'Yellow leaves',
          crop: 'Rice',
          state: 'Punjab',
          district: 'Ludhiana',
        }),
      ).resolves.toBeUndefined();

      expect(axios.post).toHaveBeenCalledTimes(1);

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/threads/thread-1/state'),
        {
          values: {
            extracted_query: 'Yellow leaves',
            extracted_crop: 'Rice',
            extracted_state: 'Punjab',
            extracted_district: 'Ludhiana',
          },
        },
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('throws when update state request fails', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));

      await expect(
        service.updateState('thread-1', {
          query: 'Yellow leaves',
          crop: 'Rice',
          state: 'Punjab',
          district: 'Ludhiana',
        }),
      ).rejects.toThrow('Failed to update ACC Agent thread state');
    });
  });
  describe('checkpointId', () => {
    it('calls checkpoint endpoint successfully', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {
          checkpoint_id: 'checkpoint-1',
        },
      } as any);

      const result = await service.checkpointId('thread-1');

      expect(result).toBeUndefined();

      expect(axios.post).toHaveBeenCalledTimes(1);

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/threads/thread-1/state'),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: expect.any(Number),
        },
      );
    });

    it('throws when checkpoint request fails', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));

      await expect(service.checkpointId('thread-1')).rejects.toThrow(
        'Failed to get checkpoint ID from ACC Agent',
      );
    });
  });
  describe('resumeAndGetAnswer', () => {
    // it('returns final answer successfully', async () => {
    //   vi.spyOn(service, 'checkpointId').mockResolvedValue(
    //     'checkpoint-1' as any,
    //   );

    //   vi.mocked(axios.post).mockResolvedValue({
    //     data: {
    //       final_answer: 'Spray fungicide after irrigation.',
    //     },
    //   } as any);

    //   const result = await service.resumeAndGetAnswer('thread-1');

    //   expect(result).toEqual({
    //     final_answer: 'Spray fungicide after irrigation.',
    //   });

    //   expect(service.checkpointId).toHaveBeenCalledWith('thread-1');

    //   expect(axios.post).toHaveBeenCalledWith(
    //     expect.stringContaining('/threads/thread-1/runs/wait'),
    //     {
    //       assistant_id: expect.anything(),
    //       checkpoint: {
    //         checkpoint_id: 'checkpoint-1',
    //       },
    //     },
    //     expect.objectContaining({
    //       headers: {
    //         'Content-Type': 'application/json',
    //       },
    //     }),
    //   );
    // });

    it('throws when final_answer is missing', async () => {
      vi.spyOn(service, 'checkpointId').mockResolvedValue(
        'checkpoint-1' as any,
      );

      vi.mocked(axios.post).mockResolvedValue({
        data: {},
      } as any);

      await expect(service.resumeAndGetAnswer('thread-1')).rejects.toThrow(
        'Failed to get final answer from ACC Agent',
      );
    });

    it('throws when resume request fails', async () => {
      vi.spyOn(service, 'checkpointId').mockResolvedValue(
        'checkpoint-1' as any,
      );

      vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));

      await expect(service.resumeAndGetAnswer('thread-1')).rejects.toThrow(
        'Failed to get final answer from ACC Agent',
      );
    });

    it('propagates checkpoint errors', async () => {
      vi.spyOn(service, 'checkpointId').mockRejectedValue(
        new InternalServerError('Checkpoint failed'),
      );

      await expect(service.resumeAndGetAnswer('thread-1')).rejects.toThrow(
        'Checkpoint failed',
      );

      expect(axios.post).not.toHaveBeenCalled();
    });
  });
  describe('checkpointId', () => {
    it('calls checkpoint endpoint successfully', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        data: {},
      } as any);

      await expect(service.checkpointId('thread-1')).resolves.toBeUndefined();

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: expect.any(Number),
        }),
      );
    });

    it('throws when checkpoint request fails', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));

      await expect(service.checkpointId('thread-1')).rejects.toThrow(
        'Failed to get checkpoint ID from ACC Agent',
      );
    });
  });
});
