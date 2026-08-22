import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getQuestionById', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getQuestionById: vi.fn(),
    };

    mockUserService = {};
    mockContextService = {};

    mockAuditTrailsService = {
      createAuditTrail: vi.fn(),
    };

    controller = new QuestionController(
      mockQuestionService,
      mockUserService,
      mockContextService,
      mockAuditTrailsService,
    );
  });

  it('returns question successfully', async () => {
    const question = {
      _id: 'question-123',
      question: 'What is wheat?',
    };

    mockQuestionService.getQuestionById.mockResolvedValue(question);

    const result = await controller.getQuestionById(
      {
        questionId: 'question-123',
      } as any,
      {},
    );

    expect(mockQuestionService.getQuestionById).toHaveBeenCalledWith(
      'question-123',
    );

    expect(result).toEqual(question);
  });

  it('passes correct question id to service', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-999',
    });

    await controller.getQuestionById(
      {
        questionId: 'question-999',
      } as any,
      {},
    );

    expect(mockQuestionService.getQuestionById).toHaveBeenCalledWith(
      'question-999',
    );
  });

  it('propagates service errors', async () => {
    mockQuestionService.getQuestionById.mockRejectedValue(
      new Error('Question not found'),
    );

    await expect(
      controller.getQuestionById(
        {
          questionId: 'question-123',
        } as any,
        {},
      ),
    ).rejects.toThrow('Question not found');
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-123',
    });

    await controller.getQuestionById(
      {
        questionId: 'question-123',
      } as any,
      {},
    );

    expect(mockQuestionService.getQuestionById).toHaveBeenCalledTimes(1);
  });
});
