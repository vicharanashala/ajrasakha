import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.addQuestion', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  const mockUser = {
    _id: {
      toString: () => 'user-123',
    },
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
    role: 'pae_expert',
    avatar: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      addQuestion: vi.fn(),
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

  it('adds question successfully', async () => {
    mockQuestionService.addQuestion.mockResolvedValue({
      data: {
        _id: 'question-123',
        question: 'What is wheat?',
        details: {
          crop: 'Wheat',
        },
      },
    });

    const body = {
      question: 'What is wheat?',
      details: {
        crop: 'Wheat',
      },
    };

    const result = await controller.addQuestion(
      undefined as any,
      body as any,
      mockUser as any,
      {} as any,
    );

    expect(mockQuestionService.addQuestion).toHaveBeenCalledWith(
      'user-123',
      body,
    );

    expect(result).toEqual({
      success: true,
      message: 'Question submitted successfully.',
      question_id: 'question-123',
    });
  });

  it('calls service exactly once', async () => {
    mockQuestionService.addQuestion.mockResolvedValue({
      data: {
        _id: 'question-123',
        question: 'Test',
        details: {},
      },
    });

    await controller.addQuestion(
      undefined as any,
      {
        question: 'Test',
      } as any,
      mockUser as any,
      {} as any,
    );

    expect(mockQuestionService.addQuestion).toHaveBeenCalledTimes(1);
  });

  it('creates audit trail on successful question creation', async () => {
    mockQuestionService.addQuestion.mockResolvedValue({
      data: {
        _id: 'question-123',
        question: 'Test Question',
        details: {
          crop: 'Wheat',
        },
      },
    });

    await controller.addQuestion(
      undefined as any,
      {
        question: 'Test Question',
      } as any,
      mockUser as any,
      {} as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.addQuestion.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.addQuestion(
        undefined as any,
        {
          question: 'Test',
        } as any,
        mockUser as any,
        {} as any,
      ),
    ).rejects.toThrow(InternalServerError);

    await expect(
      controller.addQuestion(
        undefined as any,
        {
          question: 'Test',
        } as any,
        mockUser as any,
        {} as any,
      ),
    ).rejects.toThrow('Database failure');
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.addQuestion.mockRejectedValue(
      new Error('Validation failed'),
    );

    await expect(
      controller.addQuestion(
        undefined as any,
        {
          question: 'Test',
        } as any,
        mockUser as any,
        {} as any,
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.addQuestion(
        undefined as any,
        {
          question: 'Test',
        } as any,
        mockUser as any,
        {} as any,
      ),
    ).rejects.toThrow('Validation failed');
  });

  it('creates failed audit trail when service throws error', async () => {
    mockQuestionService.addQuestion.mockRejectedValue(
      new Error('Failed to add question'),
    );

    await expect(
      controller.addQuestion(
        undefined as any,
        {
          question: 'Test',
        } as any,
        mockUser as any,
        {} as any,
      ),
    ).rejects.toThrow();

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('handles null user gracefully', async () => {
    mockQuestionService.addQuestion.mockResolvedValue({
      data: {
        _id: 'question-123',
        question: 'Test',
        details: {},
      },
    });

    const result = await controller.addQuestion(
      undefined as any,
      {
        question: 'Test',
      } as any,
      null as any,
      {} as any,
    );

    expect(mockQuestionService.addQuestion).toHaveBeenCalledWith(undefined, {
      question: 'Test',
    });

    expect(result).toEqual({
      success: true,
      message: 'Question submitted successfully.',
      question_id: 'question-123',
    });
  });

  it('passes request body unchanged to service', async () => {
    const body = {
      question: 'How to control aphids?',
      priority: 'high',
      source: 'AGRI_EXPERT',
      details: {
        crop: 'Wheat',
        state: 'Punjab',
        district: 'Ludhiana',
        season: 'Rabi',
        domain: 'Pest',
      },
    };

    mockQuestionService.addQuestion.mockResolvedValue({
      data: {
        _id: 'question-123',
        ...body,
      },
    });

    await controller.addQuestion(
      undefined as any,
      body as any,
      mockUser as any,
      {} as any,
    );

    expect(mockQuestionService.addQuestion).toHaveBeenCalledWith(
      'user-123',
      body,
    );
  });
});
