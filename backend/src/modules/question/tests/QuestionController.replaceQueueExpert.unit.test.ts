import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.replaceQueueExpert', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      replaceQueueExpert: vi.fn(),
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

  it('replaces queue expert successfully', async () => {
    const response = {
      success: true,
      message: 'Expert replaced successfully',
    };

    mockQuestionService.replaceQueueExpert.mockResolvedValue(response);

    const result = await controller.replaceQueueExpert(
      {
        questionId: 'question-123',
      } as any,
      {
        levelIndex: 0,
        newExpertId: 'expert-456',
        isAuthor: false,
        reasonForChange: 'Expert unavailable',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.replaceQueueExpert).toHaveBeenCalledWith(
      'user-123',
      'question-123',
      1,
      'expert-456',
      false,
      'Expert unavailable',
    );

    expect(result).toEqual(response);
  });

  it('increments levelIndex before calling service', async () => {
    mockQuestionService.replaceQueueExpert.mockResolvedValue({
      success: true,
    });

    await controller.replaceQueueExpert(
      {
        questionId: 'question-123',
      } as any,
      {
        levelIndex: 2,
        newExpertId: 'expert-456',
        isAuthor: false,
        reasonForChange: 'Workload balancing',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.replaceQueueExpert).toHaveBeenCalledWith(
      'user-123',
      'question-123',
      3,
      'expert-456',
      false,
      'Workload balancing',
    );
  });

  it('replaces author when isAuthor is true', async () => {
    mockQuestionService.replaceQueueExpert.mockResolvedValue({
      success: true,
    });

    await controller.replaceQueueExpert(
      {
        questionId: 'question-123',
      } as any,
      {
        levelIndex: 0,
        newExpertId: 'expert-789',
        isAuthor: true,
        reasonForChange: 'Author reassignment',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.replaceQueueExpert).toHaveBeenCalledWith(
      'user-123',
      'question-123',
      1,
      'expert-789',
      true,
      'Author reassignment',
    );
  });

  it('returns service response unchanged', async () => {
    const response = {
      success: true,
      updated: true,
      queueLength: 4,
    };

    mockQuestionService.replaceQueueExpert.mockResolvedValue(response);

    const result = await controller.replaceQueueExpert(
      {
        questionId: 'question-123',
      } as any,
      {
        levelIndex: 1,
        newExpertId: 'expert-456',
        isAuthor: false,
        reasonForChange: 'Replacement',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(result).toEqual(response);
  });

  it('throws InternalServerError when service throws InternalServerError', async () => {
    mockQuestionService.replaceQueueExpert.mockRejectedValue(
      new InternalServerError('Database failure'),
    );

    await expect(
      controller.replaceQueueExpert(
        {
          questionId: 'question-123',
        } as any,
        {
          levelIndex: 0,
          newExpertId: 'expert-456',
          isAuthor: false,
          reasonForChange: 'Replacement',
        } as any,
        {
          _id: {
            toString: () => 'user-123',
          },
        } as any,
      ),
    ).rejects.toThrow('Database failure');
  });

  it('throws generic service errors', async () => {
    mockQuestionService.replaceQueueExpert.mockRejectedValue(
      new Error('Replacement failed'),
    );

    await expect(
      controller.replaceQueueExpert(
        {
          questionId: 'question-123',
        } as any,
        {
          levelIndex: 0,
          newExpertId: 'expert-456',
          isAuthor: false,
          reasonForChange: 'Replacement',
        } as any,
        {
          _id: {
            toString: () => 'user-123',
          },
        } as any,
      ),
    ).rejects.toThrow('Replacement failed');
  });

  it('calls replaceQueueExpert exactly once', async () => {
    mockQuestionService.replaceQueueExpert.mockResolvedValue({
      success: true,
    });

    await controller.replaceQueueExpert(
      {
        questionId: 'question-123',
      } as any,
      {
        levelIndex: 0,
        newExpertId: 'expert-456',
        isAuthor: false,
        reasonForChange: 'Replacement',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.replaceQueueExpert).toHaveBeenCalledTimes(1);
  });
});
