import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.reallocateManual', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;
  const mockUser = {
    _id: 'user-123',
    role: 'moderator',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      manualReallocate: vi.fn(),
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

  it('reallocates questions successfully', async () => {
    const assignments = [
      {
        submissionId: 'submission-1',
        expertId: 'expert-1',
      },
    ];

    const response = {
      success: true,
      updated: 1,
    };

    mockQuestionService.manualReallocate.mockResolvedValue(response);

    const result = await controller.reallocateManual(
      {
        assignments,
        inactiveExpertIds: ['expert-old'],
      },
      mockUser,
    );

    expect(mockQuestionService.manualReallocate).toHaveBeenCalledWith(
      assignments,
      ['expert-old'],
    );

    expect(result).toEqual(response);
  });

  it('passes empty inactiveExpertIds', async () => {
    const assignments = [
      {
        submissionId: 'submission-1',
        expertId: 'expert-1',
      },
    ];

    mockQuestionService.manualReallocate.mockResolvedValue({
      success: true,
    });

    await controller.reallocateManual(
      {
        assignments,
      },
      mockUser,
    );

    expect(mockQuestionService.manualReallocate).toHaveBeenCalledWith(
      assignments,
      undefined,
    );
  });

  it('passes multiple assignments', async () => {
    const assignments = [
      {
        submissionId: 'submission-1',
        expertId: 'expert-1',
      },
      {
        submissionId: 'submission-2',
        expertId: 'expert-2',
      },
    ];

    mockQuestionService.manualReallocate.mockResolvedValue({
      success: true,
    });

    await controller.reallocateManual(
      {
        assignments,
        inactiveExpertIds: [],
      },
      mockUser,
    );

    expect(mockQuestionService.manualReallocate).toHaveBeenCalledWith(
      assignments,
      [],
    );
  });

  it('propagates service errors', async () => {
    mockQuestionService.manualReallocate.mockRejectedValue(
      new Error('Manual reallocation failed'),
    );

    await expect(
      controller.reallocateManual(
        {
          assignments: [],
        },
        mockUser,
      ),
    ).rejects.toThrow('Manual reallocation failed');
  });

  it('calls service exactly once', async () => {
    mockQuestionService.manualReallocate.mockResolvedValue({
      success: true,
    });

    await controller.reallocateManual(
      {
        assignments: [],
      },
      mockUser,
    );

    expect(mockQuestionService.manualReallocate).toHaveBeenCalledTimes(1);
  });
});
