import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getDetailedQuestions', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getDetailedQuestions: vi.fn(),
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

  it('returns detailed questions successfully', async () => {
    const response = {
      questions: [
        {
          _id: 'question-1',
          question: 'What is wheat?',
        },
        {
          _id: 'question-2',
          question: 'What is rice?',
        },
      ],
      totalPages: 5,
    };

    mockQuestionService.getDetailedQuestions.mockResolvedValue(response);

    const result = await controller.getDetailedQuestions(
      {
        page: 1,
        limit: 10,
      } as any,
      {
        status: 'open',
      } as any,
    );

    expect(result).toEqual(response);
  });

  it('passes query and body to service', async () => {
    const query = {
      page: 2,
      limit: 20,
    };

    const body = {
      status: 'closed',
      priority: 'high',
    };

    mockQuestionService.getDetailedQuestions.mockResolvedValue({
      questions: [],
      totalPages: 0,
    });

    await controller.getDetailedQuestions(query as any, body as any);

    expect(mockQuestionService.getDetailedQuestions).toHaveBeenCalledWith(
      query,
      body,
    );
  });

  it('returns empty result set', async () => {
    const response = {
      questions: [],
      totalPages: 0,
    };

    mockQuestionService.getDetailedQuestions.mockResolvedValue(response);

    const result = await controller.getDetailedQuestions({} as any, {} as any);

    expect(result).toEqual(response);
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getDetailedQuestions.mockResolvedValue({
      questions: [],
      totalPages: 0,
    });

    await controller.getDetailedQuestions({} as any, {} as any);

    expect(mockQuestionService.getDetailedQuestions).toHaveBeenCalledTimes(1);
  });

  it('propagates service errors', async () => {
    mockQuestionService.getDetailedQuestions.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      controller.getDetailedQuestions({} as any, {} as any),
    ).rejects.toThrow('Database failure');
  });
});
