import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.bulkDeleteQuestions', () => {
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
      bulkDeleteQuestions: vi.fn(),
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

  it('bulk deletes questions successfully', async () => {
    const response = {
      message: 'Questions scheduled for deletion',
      jobId: 'job-123',
    };

    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-1',
      question: 'What is wheat?',
    });

    mockQuestionService.bulkDeleteQuestions.mockResolvedValue(response);

    const result = await controller.bulkDeleteQuestions(
      {
        questionIds: ['question-1', 'question-2'],
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.bulkDeleteQuestions).toHaveBeenCalledWith(
      'moderator-123',
      ['question-1', 'question-2'],
    );

    expect(result).toEqual(response);
  });

  it('loads previous questions before deletion', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-1',
      question: 'Question',
    });

    mockQuestionService.bulkDeleteQuestions.mockResolvedValue({
      message: 'Deleted',
      jobId: 'job-123',
    });

    await controller.bulkDeleteQuestions(
      {
        questionIds: ['question-1', 'question-2'],
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getQuestionById).toHaveBeenCalledTimes(2);

    expect(mockQuestionService.getQuestionById).toHaveBeenNthCalledWith(
      1,
      'question-1',
    );

    expect(mockQuestionService.getQuestionById).toHaveBeenNthCalledWith(
      2,
      'question-2',
    );
  });

  it('creates success audit trail', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-1',
      question: 'Question',
    });

    mockQuestionService.bulkDeleteQuestions.mockResolvedValue({
      message: 'Deleted',
      jobId: 'job-123',
    });

    await controller.bulkDeleteQuestions(
      {
        questionIds: ['question-1'],
      } as any,
      mockUser as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-1',
    });

    mockQuestionService.bulkDeleteQuestions.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.bulkDeleteQuestions(
        {
          questionIds: ['question-1'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(InternalServerError);

    await expect(
      controller.bulkDeleteQuestions(
        {
          questionIds: ['question-1'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Database failure');
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-1',
    });

    mockQuestionService.bulkDeleteQuestions.mockRejectedValue(
      new Error('Deletion failed'),
    );

    await expect(
      controller.bulkDeleteQuestions(
        {
          questionIds: ['question-1'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.bulkDeleteQuestions(
        {
          questionIds: ['question-1'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Deletion failed');
  });

  it('creates failure audit trail when deletion fails', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-1',
      question: 'Question',
    });

    mockQuestionService.bulkDeleteQuestions.mockRejectedValue(
      new Error('Deletion failed'),
    );

    await expect(
      controller.bulkDeleteQuestions(
        {
          questionIds: ['question-1'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow();

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('calls bulkDeleteQuestions exactly once', async () => {
    mockQuestionService.getQuestionById.mockResolvedValue({
      _id: 'question-1',
      question: 'Question',
    });

    mockQuestionService.bulkDeleteQuestions.mockResolvedValue({
      message: 'Deleted',
      jobId: 'job-123',
    });

    await controller.bulkDeleteQuestions(
      {
        questionIds: ['question-1'],
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.bulkDeleteQuestions).toHaveBeenCalledTimes(1);
  });
});
