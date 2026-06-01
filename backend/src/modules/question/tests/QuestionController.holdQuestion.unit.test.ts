import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.holdQuestion', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockAuditTrailsService: any;

  const mockUser = {
    _id: {
      toString: () => 'user-123',
    },
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
    role: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      holdQuestion: vi.fn(),
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

  it('holds a question successfully', async () => {
    const response = {
      success: true,
      message: 'Question held successfully',
    };

    mockQuestionService.holdQuestion.mockResolvedValue(response);

    const result = await controller.holdQuestion(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
      {
        action: 'hold',
      },
    );

    expect(mockQuestionService.holdQuestion).toHaveBeenCalledWith(
      'question-123',
      'user-123',
      'hold',
    );

    expect(result).toEqual(response);
  });

  it('unholds a question successfully', async () => {
    const response = {
      success: true,
      message: 'Question unheld successfully',
    };

    mockQuestionService.holdQuestion.mockResolvedValue(response);

    const result = await controller.holdQuestion(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
      {
        action: 'unhold',
      },
    );

    expect(mockQuestionService.holdQuestion).toHaveBeenCalledWith(
      'question-123',
      'user-123',
      'unhold',
    );

    expect(result).toEqual(response);
  });

  it('passes correct parameters to service', async () => {
    mockQuestionService.holdQuestion.mockResolvedValue({
      success: true,
    });

    await controller.holdQuestion(
      {
        questionId: 'question-999',
      } as any,
      mockUser as any,
      {
        action: 'hold',
      },
    );

    expect(mockQuestionService.holdQuestion).toHaveBeenCalledWith(
      'question-999',
      'user-123',
      'hold',
    );
  });

  it('propagates service errors', async () => {
    mockQuestionService.holdQuestion.mockRejectedValue(
      new Error('Failed to hold question'),
    );

    await expect(
      controller.holdQuestion(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
        {
          action: 'hold',
        },
      ),
    ).rejects.toThrow('Failed to hold question');
  });

  it('calls service exactly once for hold', async () => {
    mockQuestionService.holdQuestion.mockResolvedValue({
      success: true,
    });

    await controller.holdQuestion(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
      {
        action: 'hold',
      },
    );

    expect(mockQuestionService.holdQuestion).toHaveBeenCalledTimes(1);
  });

  it('calls service exactly once for unhold', async () => {
    mockQuestionService.holdQuestion.mockResolvedValue({
      success: true,
    });

    await controller.holdQuestion(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
      {
        action: 'unhold',
      },
    );

    expect(mockQuestionService.holdQuestion).toHaveBeenCalledTimes(1);
  });
});
