import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.updateQuestion', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      updateQuestion: vi.fn(),
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

  it('updates question successfully', async () => {
    const response = {
      modifiedCount: 1,
    };

    mockQuestionService.updateQuestion.mockResolvedValue(response);

    const result = await controller.updateQuestion(
      {
        questionId: 'question-123',
      } as any,
      {
        status: 'closed',
      } as any,
    );

    expect(mockQuestionService.updateQuestion).toHaveBeenCalledWith(
      'question-123',
      {
        status: 'closed',
      },
    );

    expect(result).toEqual(response);
  });

  it('passes complete update payload to service', async () => {
    const updates = {
      question: 'Updated question',
      priority: 'high',
      status: 'open',
    };

    mockQuestionService.updateQuestion.mockResolvedValue({
      modifiedCount: 1,
    });

    await controller.updateQuestion(
      {
        questionId: 'question-123',
      } as any,
      updates as any,
    );

    expect(mockQuestionService.updateQuestion).toHaveBeenCalledWith(
      'question-123',
      updates,
    );
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.updateQuestion.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.updateQuestion(
        {
          questionId: 'question-123',
        } as any,
        {
          status: 'closed',
        } as any,
      ),
    ).rejects.toThrow(InternalServerError);

    await expect(
      controller.updateQuestion(
        {
          questionId: 'question-123',
        } as any,
        {
          status: 'closed',
        } as any,
      ),
    ).rejects.toThrow('Database failure');
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.updateQuestion.mockRejectedValue(
      new Error('Validation failed'),
    );

    await expect(
      controller.updateQuestion(
        {
          questionId: 'question-123',
        } as any,
        {
          status: 'closed',
        } as any,
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.updateQuestion(
        {
          questionId: 'question-123',
        } as any,
        {
          status: 'closed',
        } as any,
      ),
    ).rejects.toThrow('Validation failed');
  });

  it('throws BadRequestError when service throws string error', async () => {
    mockQuestionService.updateQuestion.mockRejectedValue(
      new Error('Failed to update question'),
    );

    await expect(
      controller.updateQuestion(
        {
          questionId: 'question-123',
        } as any,
        {
          priority: 'high',
        } as any,
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it('calls service exactly once', async () => {
    mockQuestionService.updateQuestion.mockResolvedValue({
      modifiedCount: 1,
    });

    await controller.updateQuestion(
      {
        questionId: 'question-123',
      } as any,
      {
        status: 'open',
      } as any,
    );

    expect(mockQuestionService.updateQuestion).toHaveBeenCalledTimes(1);
  });
});
