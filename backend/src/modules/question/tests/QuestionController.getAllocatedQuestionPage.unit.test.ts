import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getAllocatedQuestionPage', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getAllocatedQuestionPage: vi.fn(),
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

  it('returns allocated question page successfully', async () => {
    const response = {
      questionId: 'question-123',
      previousQuestionId: 'question-122',
      nextQuestionId: 'question-124',
    };

    mockQuestionService.getAllocatedQuestionPage.mockResolvedValue(response);

    const result = await controller.getAllocatedQuestionPage(
      {
        questionId: 'question-123',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(result).toEqual(response);
  });

  it('passes user id and question id to service', async () => {
    mockQuestionService.getAllocatedQuestionPage.mockResolvedValue({});

    await controller.getAllocatedQuestionPage(
      {
        questionId: 'question-123',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.getAllocatedQuestionPage).toHaveBeenCalledWith(
      'user-123',
      'question-123',
    );
  });

  it('returns null when service returns null', async () => {
    mockQuestionService.getAllocatedQuestionPage.mockResolvedValue(null);

    const result = await controller.getAllocatedQuestionPage(
      {
        questionId: 'question-123',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(result).toBeNull();
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getAllocatedQuestionPage.mockResolvedValue({});

    await controller.getAllocatedQuestionPage(
      {
        questionId: 'question-123',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.getAllocatedQuestionPage).toHaveBeenCalledTimes(
      1,
    );
  });

  it('propagates service errors', async () => {
    mockQuestionService.getAllocatedQuestionPage.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      controller.getAllocatedQuestionPage(
        {
          questionId: 'question-123',
        } as any,
        {
          _id: {
            toString: () => 'user-123',
          },
        } as any,
      ),
    ).rejects.toThrow('Database failure');
  });
});
