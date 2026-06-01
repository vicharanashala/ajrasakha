import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.deleteQuestion', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  const mockUser = {
    _id: {
      toString: () => 'moderator-123',
    },
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
    role: 'moderator',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getQuestionById: vi.fn(),
      deleteQuestion: vi.fn(),
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

  it('deletes question successfully', async () => {
    const deletedResponse = {
      deletedCount: 1,
    };

    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-123',
      question: 'What is wheat?',
    });

    mockQuestionService.deleteQuestion.mockResolvedValue(deletedResponse);

    const result = await controller.deleteQuestion(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.deleteQuestion).toHaveBeenCalledWith(
      'question-123',
    );

    expect(result).toEqual(deletedResponse);
  });

  it('loads existing question before deleting', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-123',
      question: 'Question',
    });

    mockQuestionService.deleteQuestion.mockResolvedValue({
      deletedCount: 1,
    });

    await controller.deleteQuestion(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getQuestionById).toHaveBeenCalledWith(
      'question-123',
    );
  });

  it('creates success audit trail', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-123',
      question: 'Question',
    });

    mockQuestionService.deleteQuestion.mockResolvedValue({
      deletedCount: 1,
    });

    await controller.deleteQuestion(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-123',
      question: 'Question',
    });

    mockQuestionService.deleteQuestion.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.deleteQuestion(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(InternalServerError);

    await expect(
      controller.deleteQuestion(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Database failure');
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-123',
      question: 'Question',
    });

    mockQuestionService.deleteQuestion.mockRejectedValue(
      new Error('Delete failed'),
    );

    await expect(
      controller.deleteQuestion(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.deleteQuestion(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Delete failed');
  });

  it('creates failure audit trail when deletion fails', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-123',
      question: 'Question',
    });

    mockQuestionService.deleteQuestion.mockRejectedValue(
      new Error('Delete failed'),
    );

    await expect(
      controller.deleteQuestion(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow();

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('calls deleteQuestion exactly once', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-123',
      question: 'Question',
    });

    mockQuestionService.deleteQuestion.mockResolvedValue({
      deletedCount: 1,
    });

    await controller.deleteQuestion(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.deleteQuestion).toHaveBeenCalledTimes(1);
  });
});
