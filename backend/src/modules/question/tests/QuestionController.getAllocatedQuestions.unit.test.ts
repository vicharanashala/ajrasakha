import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getAllocatedQuestions', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getAllocatedQuestions: vi.fn(),
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

  it('returns allocated questions successfully', async () => {
    const questions = [
      {
        _id: 'question-1',
        question: 'What is wheat?',
      },
      {
        _id: 'question-2',
        question: 'What is rice?',
      },
    ];

    mockQuestionService.getAllocatedQuestions.mockResolvedValue(questions);

    const result = await controller.getAllocatedQuestions(
      {
        page: 1,
        limit: 10,
      } as any,
      {
        status: 'open',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(result).toEqual(questions);
  });

  it('passes user id query and body to service', async () => {
    const query = {
      page: 1,
      limit: 20,
    };

    const body = {
      status: 'open',
      priority: 'high',
    };

    mockQuestionService.getAllocatedQuestions.mockResolvedValue([]);

    await controller.getAllocatedQuestions(
      query as any,
      body as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.getAllocatedQuestions).toHaveBeenCalledWith(
      'user-123',
      query,
      body,
    );
  });

  it('returns empty array when no questions are allocated', async () => {
    mockQuestionService.getAllocatedQuestions.mockResolvedValue([]);

    const result = await controller.getAllocatedQuestions(
      {} as any,
      {} as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(result).toEqual([]);
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getAllocatedQuestions.mockResolvedValue([]);

    await controller.getAllocatedQuestions(
      {} as any,
      {} as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.getAllocatedQuestions).toHaveBeenCalledTimes(1);
  });

  it('propagates service errors', async () => {
    mockQuestionService.getAllocatedQuestions.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      controller.getAllocatedQuestions(
        {} as any,
        {} as any,
        {
          _id: {
            toString: () => 'user-123',
          },
        } as any,
      ),
    ).rejects.toThrow('Database failure');
  });
});
