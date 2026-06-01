import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.checkStatus', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      checkStatus: vi.fn(),
    };

    mockAuditTrailsService = {
      createAuditTrail: vi.fn(),
    };

    controller = new QuestionController(
      mockQuestionService,
      {} as any,
      {} as any,
      mockAuditTrailsService,
    );
  });

  it('returns status for multiple questions successfully', async () => {
    const statusResult = [
      {
        questionId: 'q1',
        status: 'open',
      },
      {
        questionId: 'q2',
        status: 'closed',
      },
    ];

    mockQuestionService.checkStatus.mockResolvedValue(statusResult);

    const result = await controller.checkStatus({
      question_ids: ['q1', 'q2'],
    });

    expect(mockQuestionService.checkStatus).toHaveBeenCalledWith(['q1', 'q2']);

    expect(result).toEqual({
      success: true,
      data: statusResult,
    });
  });

  it('throws when question_ids is missing', async () => {
    await expect(controller.checkStatus({} as any)).rejects.toThrow(
      BadRequestError,
    );

    await expect(controller.checkStatus({} as any)).rejects.toThrow(
      'question_ids must be an array',
    );
  });

  it('throws when question_ids is not an array', async () => {
    await expect(
      controller.checkStatus({
        question_ids: 'q1',
      } as any),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.checkStatus({
        question_ids: 'q1',
      } as any),
    ).rejects.toThrow('question_ids must be an array');
  });

  it('allows empty array', async () => {
    mockQuestionService.checkStatus.mockResolvedValue([]);

    const result = await controller.checkStatus({
      question_ids: [],
    });

    expect(mockQuestionService.checkStatus).toHaveBeenCalledWith([]);

    expect(result).toEqual({
      success: true,
      data: [],
    });
  });

  it('passes all ids to service', async () => {
    mockQuestionService.checkStatus.mockResolvedValue([]);

    const ids = ['q1', 'q2', 'q3'];

    await controller.checkStatus({
      question_ids: ids,
    });

    expect(mockQuestionService.checkStatus).toHaveBeenCalledWith(ids);
  });

  it('propagates service errors', async () => {
    mockQuestionService.checkStatus.mockRejectedValue(
      new Error('Database error'),
    );

    await expect(
      controller.checkStatus({
        question_ids: ['q1'],
      }),
    ).rejects.toThrow('Database error');
  });

  it('calls service exactly once', async () => {
    mockQuestionService.checkStatus.mockResolvedValue([]);

    await controller.checkStatus({
      question_ids: ['q1'],
    });

    expect(mockQuestionService.checkStatus).toHaveBeenCalledTimes(1);
  });
});
