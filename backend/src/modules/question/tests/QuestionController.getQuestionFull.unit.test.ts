import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {NotFoundError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getQuestionFull', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getQuestionFullData: vi.fn(),
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

  const mockUser = {
    _id: {
      toString: () => 'user-123',
    },
  };

  it('returns full question data successfully', async () => {
    mockQuestionService.getQuestionFullData.mockResolvedValue({
      question: {
        _id: 'question-123',
        question: 'What is wheat?',
      },
      approved_moderator: {
        name: 'Moderator',
      },
    });

    const result = await controller.getQuestionFull(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getQuestionFullData).toHaveBeenCalledWith(
      'question-123',
      'user-123',
    );

    expect(result).toEqual({
      success: true,
      data: {
        _id: 'question-123',
        question: 'What is wheat?',
        approved_moderator: {
          name: 'Moderator',
        },
      },
    });
  });

  it('throws NotFoundError when question does not exist', async () => {
    mockQuestionService.getQuestionFullData.mockResolvedValue({
      question: null,
      approved_moderator: null,
    });

    await expect(
      controller.getQuestionFull(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(NotFoundError);

    await expect(
      controller.getQuestionFull(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Question with id question-123 not found');
  });

  it('passes correct question id and user id', async () => {
    mockQuestionService.getQuestionFullData.mockResolvedValue({
      question: {
        _id: 'question-999',
      },
      approved_moderator: null,
    });

    await controller.getQuestionFull(
      {
        questionId: 'question-999',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getQuestionFullData).toHaveBeenCalledWith(
      'question-999',
      'user-123',
    );
  });

  it('includes approved moderator in response', async () => {
    mockQuestionService.getQuestionFullData.mockResolvedValue({
      question: {
        _id: 'question-123',
      },
      approved_moderator: {
        _id: 'moderator-1',
        firstName: 'John',
      },
    });

    const result = await controller.getQuestionFull(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(result.data.approved_moderator).toEqual({
      _id: 'moderator-1',
      firstName: 'John',
    });
  });

  it('propagates service errors', async () => {
    mockQuestionService.getQuestionFullData.mockRejectedValue(
      new Error('Database error'),
    );

    await expect(
      controller.getQuestionFull(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Database error');
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getQuestionFullData.mockResolvedValue({
      question: {
        _id: 'question-123',
      },
      approved_moderator: null,
    });

    await controller.getQuestionFull(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getQuestionFullData).toHaveBeenCalledTimes(1);
  });
});
