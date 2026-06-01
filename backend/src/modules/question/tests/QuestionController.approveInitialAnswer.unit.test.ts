import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.approveInitialAnswer', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      approveAiInitialAnswer: vi.fn(),
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

  it('approves AI initial answer successfully', async () => {
    const response = {
      success: true,
      message: 'AI initial answer approved successfully',
    };

    mockQuestionService.approveAiInitialAnswer.mockResolvedValue(response);

    const result = await controller.approveInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {
        answer: 'Approved answer content',
      } as any,
    );

    expect(mockQuestionService.approveAiInitialAnswer).toHaveBeenCalledWith(
      'question-123',
      'Approved answer content',
    );

    expect(result).toEqual(response);
  });

  it('passes answer exactly as received', async () => {
    mockQuestionService.approveAiInitialAnswer.mockResolvedValue({
      success: true,
    });

    await controller.approveInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {
        answer: 'Detailed approved answer',
      } as any,
    );

    expect(mockQuestionService.approveAiInitialAnswer).toHaveBeenCalledWith(
      'question-123',
      'Detailed approved answer',
    );
  });

  it('returns service response unchanged', async () => {
    const response = {
      modifiedCount: 1,
      approved: true,
    };

    mockQuestionService.approveAiInitialAnswer.mockResolvedValue(response);

    const result = await controller.approveInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {
        answer: 'Approved answer',
      } as any,
    );

    expect(result).toEqual(response);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.approveAiInitialAnswer.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.approveInitialAnswer(
        {
          questionId: 'question-123',
        } as any,
        {
          answer: 'Approved answer',
        } as any,
      ),
    ).rejects.toThrow('Database failure');
  });

  it('throws generic service errors', async () => {
    mockQuestionService.approveAiInitialAnswer.mockRejectedValue(
      new Error('Approval failed'),
    );

    await expect(
      controller.approveInitialAnswer(
        {
          questionId: 'question-123',
        } as any,
        {
          answer: 'Approved answer',
        } as any,
      ),
    ).rejects.toThrow('Approval failed');
  });

  it('calls approveAiInitialAnswer exactly once', async () => {
    mockQuestionService.approveAiInitialAnswer.mockResolvedValue({
      success: true,
    });

    await controller.approveInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {
        answer: 'Approved answer',
      } as any,
    );

    expect(mockQuestionService.approveAiInitialAnswer).toHaveBeenCalledTimes(1);
  });

  it('passes empty answer to service', async () => {
    mockQuestionService.approveAiInitialAnswer.mockResolvedValue({
      success: true,
    });

    await controller.approveInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {
        answer: '',
      } as any,
    );

    expect(mockQuestionService.approveAiInitialAnswer).toHaveBeenCalledWith(
      'question-123',
      '',
    );
  });
});
