import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.checkSubmissionExists', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      checkSubmissionExists: vi.fn(),
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

  it('returns exists true when submission exists', async () => {
    mockQuestionService.checkSubmissionExists.mockResolvedValue(true);

    const result = await controller.checkSubmissionExists({
      questionId: 'question-123',
    } as any);

    expect(mockQuestionService.checkSubmissionExists).toHaveBeenCalledWith(
      'question-123',
    );

    expect(result).toEqual({
      exists: true,
    });
  });

  it('returns exists false when submission does not exist', async () => {
    mockQuestionService.checkSubmissionExists.mockResolvedValue(false);

    const result = await controller.checkSubmissionExists({
      questionId: 'question-123',
    } as any);

    expect(mockQuestionService.checkSubmissionExists).toHaveBeenCalledWith(
      'question-123',
    );

    expect(result).toEqual({
      exists: false,
    });
  });

  it('passes the correct question id to service', async () => {
    mockQuestionService.checkSubmissionExists.mockResolvedValue(true);

    await controller.checkSubmissionExists({
      questionId: 'question-999',
    } as any);

    expect(mockQuestionService.checkSubmissionExists).toHaveBeenCalledWith(
      'question-999',
    );
  });

  it('propagates service errors', async () => {
    mockQuestionService.checkSubmissionExists.mockRejectedValue(
      new Error('Database error'),
    );

    await expect(
      controller.checkSubmissionExists({
        questionId: 'question-123',
      } as any),
    ).rejects.toThrow('Database error');
  });

  it('calls service exactly once', async () => {
    mockQuestionService.checkSubmissionExists.mockResolvedValue(true);

    await controller.checkSubmissionExists({
      questionId: 'question-123',
    } as any);

    expect(mockQuestionService.checkSubmissionExists).toHaveBeenCalledTimes(1);
  });
});
