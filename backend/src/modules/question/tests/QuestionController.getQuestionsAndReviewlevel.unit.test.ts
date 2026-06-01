import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getQuestionsAndReviewlevel', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getQuestionAndReviewLevel: vi.fn(),
    };

    mockUserService = {};
    mockContextService = {};
    mockAuditTrailsService = {};

    controller = new QuestionController(
      mockQuestionService,
      mockUserService,
      mockContextService,
      mockAuditTrailsService,
    );
  });

  it('returns questions and review levels', async () => {
    const response = {
      questions: [],
      reviewLevels: [],
    };

    mockQuestionService.getQuestionAndReviewLevel.mockResolvedValue(response);

    const query = {
      page: 1,
      limit: 10,
    };

    const result = await controller.getQuestionsAndReviewlevel(query as any);

    expect(mockQuestionService.getQuestionAndReviewLevel).toHaveBeenCalledWith(
      query,
    );

    expect(result).toEqual(response);
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getQuestionAndReviewLevel.mockResolvedValue({});

    await controller.getQuestionsAndReviewlevel({} as any);

    expect(mockQuestionService.getQuestionAndReviewLevel).toHaveBeenCalledTimes(
      1,
    );
  });
});
