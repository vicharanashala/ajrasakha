import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.removeAllocation', () => {
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
      getExprtIdByIndex: vi.fn(),
      getQuestionById: vi.fn(),
      removeExpertFromQueue: vi.fn(),
      updateQuestion: vi.fn(),
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

  it('removes allocation successfully', async () => {
    mockQuestionService.getExprtIdByIndex.mockResolvedValue('expert-123');

    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'expert-123',
      },
      firstName: 'Expert',
      lastName: 'One',
      email: 'expert@test.com',
      role: 'expert',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'What is wheat?',
    });

    const response = {
      queue: [],
    };

    mockQuestionService.removeExpertFromQueue.mockResolvedValue(response);

    const result = await controller.removeAllocation(
      {
        questionId: 'question-123',
      } as any,
      {
        index: 0,
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.removeExpertFromQueue).toHaveBeenCalledWith(
      'moderator-123',
      'question-123',
      0,
    );

    expect(result).toEqual(response);
  });

  it('loads expert details before removing allocation', async () => {
    mockQuestionService.getExprtIdByIndex.mockResolvedValue('expert-123');

    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'expert-123',
      },
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'Question',
    });

    mockQuestionService.removeExpertFromQueue.mockResolvedValue({});

    await controller.removeAllocation(
      {
        questionId: 'question-123',
      } as any,
      {
        index: 1,
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.getExprtIdByIndex).toHaveBeenCalledWith(
      'question-123',
      1,
    );

    expect(mockUserService.getUserById).toHaveBeenCalledWith('expert-123');
  });

  it('creates success audit trail', async () => {
    mockQuestionService.getExprtIdByIndex.mockResolvedValue('expert-123');

    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'expert-123',
      },
      firstName: 'Expert',
      lastName: 'One',
      email: 'expert@test.com',
      role: 'expert',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'What is wheat?',
    });

    mockQuestionService.removeExpertFromQueue.mockResolvedValue({});

    await controller.removeAllocation(
      {
        questionId: 'question-123',
      } as any,
      {
        index: 0,
      } as any,
      mockUser as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.getExprtIdByIndex.mockResolvedValue('expert-123');

    mockUserService.getUserById.mockResolvedValue({
      firstName: 'Expert',
      lastName: 'One',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'Question',
    });

    mockQuestionService.removeExpertFromQueue.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.removeAllocation(
        {
          questionId: 'question-123',
        } as any,
        {
          index: 0,
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(InternalServerError);
  });

  it('wraps generic errors in BadRequestError', async () => {
    mockQuestionService.getExprtIdByIndex.mockResolvedValue('expert-123');

    mockUserService.getUserById.mockResolvedValue({
      firstName: 'Expert',
      lastName: 'One',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'Question',
    });

    mockQuestionService.removeExpertFromQueue.mockRejectedValue(
      new Error('Allocation failed'),
    );

    await expect(
      controller.removeAllocation(
        {
          questionId: 'question-123',
        } as any,
        {
          index: 0,
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.removeAllocation(
        {
          questionId: 'question-123',
        } as any,
        {
          index: 0,
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Allocation failed');
  });

  it('creates failure audit trail when allocation removal fails', async () => {
    mockQuestionService.getExprtIdByIndex.mockResolvedValue('expert-123');

    mockUserService.getUserById.mockResolvedValue({
      firstName: 'Expert',
      lastName: 'One',
      email: 'expert@test.com',
      role: 'expert',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'Question',
    });

    mockQuestionService.removeExpertFromQueue.mockRejectedValue(
      new Error('Failed'),
    );

    await expect(
      controller.removeAllocation(
        {
          questionId: 'question-123',
        } as any,
        {
          index: 0,
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow();

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);
  });

  it('calls removeExpertFromQueue exactly once', async () => {
    mockQuestionService.getExprtIdByIndex.mockResolvedValue('expert-123');

    mockUserService.getUserById.mockResolvedValue({
      _id: {
        toString: () => 'expert-123',
      },
      firstName: 'Expert',
      lastName: 'One',
      email: 'expert@test.com',
      role: 'expert',
    });

    mockQuestionService.getQuestionById.mockResolvedValue({
      text: 'Question',
    });

    mockQuestionService.removeExpertFromQueue.mockResolvedValue({});

    await controller.removeAllocation(
      {
        questionId: 'question-123',
      } as any,
      {
        index: 0,
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.removeExpertFromQueue).toHaveBeenCalledTimes(1);
  });
});
