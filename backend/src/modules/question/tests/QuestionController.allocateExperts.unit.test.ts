import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.allocateExperts', () => {
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
    role: 'admin',
    avatar: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      allocateExperts: vi.fn(),
      getQuestionDataById: vi.fn(),
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

  it('allocates experts successfully', async () => {
    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'expert-1',
      },
      firstName: 'Expert',
      lastName: 'One',
      email: 'expert@test.com',
      role: 'expert',
    });

    mockQuestionService.getQuestionDataById.mockResolvedValue({
      question: 'What is wheat?',
    });

    mockQuestionService.allocateExperts.mockResolvedValue({
      success: true,
    });

    const result = await controller.allocateExperts(
      {
        questionId: 'question-123',
      } as any,
      {
        experts: ['expert-1'],
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.allocateExperts).toHaveBeenCalledWith(
      'user-123',
      'question-123',
      ['expert-1'],
    );

    expect(result).toEqual({
      success: true,
    });
  });

  it('loads expert details before allocation', async () => {
    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'expert-1',
      },
      firstName: 'Expert',
      email: 'expert@test.com',
    });

    mockQuestionService.getQuestionDataById.mockResolvedValue({
      question: 'What is wheat?',
    });

    mockQuestionService.allocateExperts.mockResolvedValue({
      success: true,
    });

    await controller.allocateExperts(
      {
        questionId: 'question-123',
      } as any,
      {
        experts: ['expert-1'],
      } as any,
      mockUser as any,
    );

    expect(mockUserService.getUserById).toHaveBeenCalledWith('expert-1');
  });

  it('creates success audit trail', async () => {
    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'expert-1',
      },
    });

    mockQuestionService.getQuestionDataById.mockResolvedValue({
      question: 'What is wheat?',
    });

    mockQuestionService.allocateExperts.mockResolvedValue({
      success: true,
    });

    await controller.allocateExperts(
      {
        questionId: 'question-123',
      } as any,
      {
        experts: ['expert-1'],
      } as any,
      mockUser as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockUserService.getUserById.mockResolvedValue({});

    mockQuestionService.getQuestionDataById.mockResolvedValue({
      question: 'What is wheat?',
    });

    mockQuestionService.allocateExperts.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.allocateExperts(
        {
          questionId: 'question-123',
        } as any,
        {
          experts: ['expert-1'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(InternalServerError);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockUserService.getUserById.mockResolvedValue({});

    mockQuestionService.getQuestionDataById.mockResolvedValue({
      question: 'What is wheat?',
    });

    mockQuestionService.allocateExperts.mockRejectedValue(
      new Error('Allocation failed'),
    );

    await expect(
      controller.allocateExperts(
        {
          questionId: 'question-123',
        } as any,
        {
          experts: ['expert-1'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(BadRequestError);
  });

  it('creates failure audit trail on error', async () => {
    mockUserService.getUserById.mockResolvedValue({});

    mockQuestionService.getQuestionDataById.mockResolvedValue({
      question: 'What is wheat?',
    });

    mockQuestionService.allocateExperts.mockRejectedValue(
      new Error('Allocation failed'),
    );

    await expect(
      controller.allocateExperts(
        {
          questionId: 'question-123',
        } as any,
        {
          experts: ['expert-1'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow();

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('calls allocation service exactly once', async () => {
    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'expert-1',
      },
      firstName: 'Expert',
      lastName: 'One',
      email: 'expert@test.com',
      role: 'expert',
    });

    mockQuestionService.getQuestionDataById.mockResolvedValue({
      question: 'What is wheat?',
    });

    mockQuestionService.allocateExperts.mockResolvedValue({
      success: true,
    });

    await controller.allocateExperts(
      {
        questionId: 'question-123',
      } as any,
      {
        experts: ['expert-1'],
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.allocateExperts).toHaveBeenCalledTimes(1);
  });
});
