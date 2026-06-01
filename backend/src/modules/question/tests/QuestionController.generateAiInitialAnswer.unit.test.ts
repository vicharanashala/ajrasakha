import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.generateAiInitialAnswer', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      generateAiInitialAnswer: vi.fn(),
      getQuestionById: vi.fn(),
    };

    mockUserService = {
      getUserById: vi.fn(),
    };

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

  it('generates AI answer successfully without userId', async () => {
    mockQuestionService.generateAiInitialAnswer.mockResolvedValue(
      'AI generated answer',
    );

    const result = await controller.generateAiInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {} as any,
    );

    expect(mockQuestionService.generateAiInitialAnswer).toHaveBeenCalledWith(
      'question-123',
    );

    expect(result).toBe('AI generated answer');

    expect(mockAuditTrailsService.createAuditTrail).not.toHaveBeenCalled();
  });

  it('generates AI answer successfully with userId', async () => {
    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'user-123',
      },
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.com',
      role: 'admin',
      avatar: '',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'What is wheat?',
      aiInitialAnswer: null,
    });

    mockQuestionService.generateAiInitialAnswer.mockResolvedValue(
      'Generated answer',
    );

    const result = await controller.generateAiInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {
        userId: 'user-123',
      } as any,
    );

    expect(mockUserService.getUserById).toHaveBeenCalledWith('user-123');

    expect(mockQuestionService.getQuestionById).toHaveBeenCalledWith(
      'question-123',
    );

    expect(mockQuestionService.generateAiInitialAnswer).toHaveBeenCalledWith(
      'question-123',
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);

    expect(result).toBe('Generated answer');
  });

  it('creates audit trail with generated answer', async () => {
    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'user-123',
      },
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.com',
      role: 'admin',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'Question text',
      aiInitialAnswer: null,
    });

    mockQuestionService.generateAiInitialAnswer.mockResolvedValue(
      'New AI Answer',
    );

    await controller.generateAiInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {
        userId: 'user-123',
      } as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          after: {
            aiInitialAnswer: 'New AI Answer',
          },
        }),
      }),
    );
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.generateAiInitialAnswer.mockRejectedValue(
      new InternalServerError('AI service unavailable'),
    );

    await expect(
      controller.generateAiInitialAnswer(
        {
          questionId: 'question-123',
        } as any,
        {} as any,
      ),
    ).rejects.toThrow(InternalServerError);

    await expect(
      controller.generateAiInitialAnswer(
        {
          questionId: 'question-123',
        } as any,
        {} as any,
      ),
    ).rejects.toThrow('AI service unavailable');
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.generateAiInitialAnswer.mockRejectedValue(
      new Error('Generation failed'),
    );

    await expect(
      controller.generateAiInitialAnswer(
        {
          questionId: 'question-123',
        } as any,
        {} as any,
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.generateAiInitialAnswer(
        {
          questionId: 'question-123',
        } as any,
        {} as any,
      ),
    ).rejects.toThrow('Generation failed');
  });

  it('creates failure audit trail when generation fails', async () => {
    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'user-123',
      },
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.com',
      role: 'admin',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'Question text',
      aiInitialAnswer: null,
    });

    mockQuestionService.generateAiInitialAnswer.mockRejectedValue(
      new Error('Generation failed'),
    );

    await expect(
      controller.generateAiInitialAnswer(
        {
          questionId: 'question-123',
        } as any,
        {
          userId: 'user-123',
        } as any,
      ),
    ).rejects.toThrow(BadRequestError);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('calls generateAiInitialAnswer exactly once', async () => {
    mockQuestionService.generateAiInitialAnswer.mockResolvedValue('AI answer');

    await controller.generateAiInitialAnswer(
      {
        questionId: 'question-123',
      } as any,
      {} as any,
    );

    expect(mockQuestionService.generateAiInitialAnswer).toHaveBeenCalledTimes(
      1,
    );
  });
});
