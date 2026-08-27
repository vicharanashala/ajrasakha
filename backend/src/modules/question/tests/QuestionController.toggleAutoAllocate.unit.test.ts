import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.toggleAutoAllocate', () => {
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
      getQuestionDataById: vi.fn(),
      toggleAutoAllocate: vi.fn(),
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

  it('toggles auto allocate successfully', async () => {
    mockQuestionService.getQuestionDataById.mockResolvedValue({
      text: 'What is wheat?',
      isAutoAllocate: true,
    });

    mockQuestionService.toggleAutoAllocate.mockResolvedValue({
      message: 'Auto allocation updated',
      data: [],
    });

    const result = await controller.toggleAutoAllocate(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getQuestionDataById).toHaveBeenCalledWith(
      'question-123',
    );

    expect(mockQuestionService.toggleAutoAllocate).toHaveBeenCalledWith(
      'question-123',
    );

    expect(result).toBe('Auto allocation updated');

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('loads expert details when experts are returned', async () => {
    mockQuestionService.getQuestionDataById.mockResolvedValue({
      text: 'Question text',
      isAutoAllocate: false,
    });

    mockQuestionService.toggleAutoAllocate.mockResolvedValue({
      message: 'Updated',
      data: ['expert-1', 'expert-2'],
    });

    mockUserService.getUserById
      .mockResolvedValueOnce({
        _id: {
          toString: () => 'expert-1',
        },
        firstName: 'John',
        lastName: 'Expert',
        email: 'john@test.com',
      })
      .mockResolvedValueOnce({
        _id: {
          toString: () => 'expert-2',
        },
        firstName: 'Jane',
        lastName: 'Expert',
        email: 'jane@test.com',
      });

    await controller.toggleAutoAllocate(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockUserService.getUserById).toHaveBeenCalledTimes(2);

    expect(mockUserService.getUserById).toHaveBeenCalledWith('expert-1');

    expect(mockUserService.getUserById).toHaveBeenCalledWith('expert-2');
  });

  it('creates success audit trail', async () => {
    mockQuestionService.getQuestionDataById.mockResolvedValue({
      text: 'Question text',
      isAutoAllocate: true,
    });

    mockQuestionService.toggleAutoAllocate.mockResolvedValue({
      message: 'Updated',
      data: [],
    });

    await controller.toggleAutoAllocate(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.getQuestionDataById.mockResolvedValue({
      text: 'Question text',
      isAutoAllocate: true,
    });

    mockQuestionService.toggleAutoAllocate.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.toggleAutoAllocate(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(InternalServerError);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.getQuestionDataById.mockResolvedValue({
      text: 'Question text',
      isAutoAllocate: true,
    });

    mockQuestionService.toggleAutoAllocate.mockRejectedValue(
      new Error('Validation failed'),
    );

    await expect(
      controller.toggleAutoAllocate(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.toggleAutoAllocate(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Validation failed');
  });

  it('creates failure audit trail when toggle fails', async () => {
    mockQuestionService.getQuestionDataById.mockResolvedValue({
      question: 'What is wheat?',
      isAutoAllocate: true,
    });

    mockQuestionService.toggleAutoAllocate.mockRejectedValue(
      new Error('Failed to toggle'),
    );

    await expect(
      controller.toggleAutoAllocate(
        {
          questionId: 'question-123',
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow();

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('calls services exactly once', async () => {
    mockQuestionService.getQuestionDataById.mockResolvedValue({
      text: 'Question text',
      isAutoAllocate: true,
    });

    mockQuestionService.toggleAutoAllocate.mockResolvedValue({
      message: 'Updated',
      data: [],
    });

    await controller.toggleAutoAllocate(
      {
        questionId: 'question-123',
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getQuestionDataById).toHaveBeenCalledTimes(1);

    expect(mockQuestionService.toggleAutoAllocate).toHaveBeenCalledTimes(1);
  });
});
