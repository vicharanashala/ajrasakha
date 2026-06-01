import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {NotFoundError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getChatbotDetails', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockAuditTrailsService: any;

  const mockUser = {
    _id: {
      toString: () => 'user-123',
    },
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
    role: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getMatchedQuestion: vi.fn(),
    };

    mockAuditTrailsService = {
      createAuditTrail: vi.fn(),
    };

    controller = new QuestionController(
      mockQuestionService,
      {} as any,
      {} as any,
      mockAuditTrailsService,
    );
  });

  it('returns chatbot details successfully', async () => {
    const chatbotData = {
      messageId: 'msg-123',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
      user: {
        id: 'user-123',
        name: 'John Doe',
      },
      content: 'What is wheat?',
    };

    mockQuestionService.getMatchedQuestion.mockResolvedValue(chatbotData);

    const result = await controller.getChatbotDetails(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getMatchedQuestion).toHaveBeenCalledWith(
      'question-123',
      'user-123',
    );

    expect(result).toEqual({
      success: true,
      data: {
        messageId: chatbotData.messageId,
        createdAt: chatbotData.createdAt,
        updatedAt: chatbotData.updatedAt,
        user: chatbotData.user,
        content: chatbotData.content,
      },
    });
  });

  it('throws NotFoundError when chatbot data does not exist', async () => {
    mockQuestionService.getMatchedQuestion.mockResolvedValue(null);

    await expect(
      controller.getChatbotDetails(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(NotFoundError);

    await expect(
      controller.getChatbotDetails(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Question with id question-123 not found');
  });

  it('passes correct user id to service', async () => {
    mockQuestionService.getMatchedQuestion.mockResolvedValue({
      messageId: 'msg-123',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {},
      content: 'content',
    });

    await controller.getChatbotDetails(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getMatchedQuestion).toHaveBeenCalledWith(
      'question-123',
      'user-123',
    );
  });

  it('returns only expected chatbot fields', async () => {
    mockQuestionService.getMatchedQuestion.mockResolvedValue({
      messageId: 'msg-123',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {},
      content: 'content',
      extraField: 'should-not-be-returned',
    });

    const result = await controller.getChatbotDetails(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(result.success).toBe(true);

    expect(result.data).not.toHaveProperty('extraField');
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getMatchedQuestion.mockResolvedValue({
      messageId: 'msg-123',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {},
      content: 'content',
    });

    await controller.getChatbotDetails(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getMatchedQuestion).toHaveBeenCalledTimes(1);
  });
});
