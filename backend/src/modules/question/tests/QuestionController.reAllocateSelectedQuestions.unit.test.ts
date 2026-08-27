import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.reAllocateSelectedQuestions', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      balanceWorkloadSelectedQuestions: vi.fn(),
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

  it('reallocates selected questions successfully', async () => {
    const response = {
      expertsInvolved: 4,
      submissionsProcessed: 12,
    };

    mockQuestionService.balanceWorkloadSelectedQuestions.mockResolvedValue(
      response,
    );

    const result = await controller.reAllocateSelectedQuestions(
      mockUser as any,
      {
        questionIds: ['q1', 'q2', 'q3'],
      } as any,
    );

    expect(
      mockQuestionService.balanceWorkloadSelectedQuestions,
    ).toHaveBeenCalledWith(['q1', 'q2', 'q3']);

    expect(result).toEqual(response);
  });

  it('passes empty array when questionIds is undefined', async () => {
    mockQuestionService.balanceWorkloadSelectedQuestions.mockResolvedValue({
      expertsInvolved: 0,
      submissionsProcessed: 0,
    });

    await controller.reAllocateSelectedQuestions(mockUser as any, {} as any);

    expect(
      mockQuestionService.balanceWorkloadSelectedQuestions,
    ).toHaveBeenCalledWith([]);
  });

  it('creates success audit trail', async () => {
    mockQuestionService.balanceWorkloadSelectedQuestions.mockResolvedValue({
      expertsInvolved: 3,
      submissionsProcessed: 7,
    });

    await controller.reAllocateSelectedQuestions(
      mockUser as any,
      {
        questionIds: ['q1'],
      } as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: {
          after: {
            expertsInvolved: 3,
            submissionsProcessed: 7,
          },
        },
      }),
    );
  });

  it('throws BadRequestError when service throws generic error', async () => {
    mockQuestionService.balanceWorkloadSelectedQuestions.mockRejectedValue(
      new Error('Reallocation failed'),
    );

    await expect(
      controller.reAllocateSelectedQuestions(
        mockUser as any,
        {
          questionIds: ['q1'],
        } as any,
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.reAllocateSelectedQuestions(
        mockUser as any,
        {
          questionIds: ['q1'],
        } as any,
      ),
    ).rejects.toThrow('Reallocation failed');
  });

  it('creates failure audit trail when service fails', async () => {
    mockQuestionService.balanceWorkloadSelectedQuestions.mockRejectedValue(
      new Error('Reallocation failed'),
    );

    await expect(
      controller.reAllocateSelectedQuestions(
        mockUser as any,
        {
          questionIds: ['q1'],
        } as any,
      ),
    ).rejects.toThrow(BadRequestError);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: expect.objectContaining({
          status: expect.anything(),
          errorMessage: 'Reallocation failed',
        }),
      }),
    );
  });

  it('returns service response unchanged', async () => {
    const response = {
      expertsInvolved: 5,
      submissionsProcessed: 20,
      reallocatedQuestions: ['q1', 'q2'],
    };

    mockQuestionService.balanceWorkloadSelectedQuestions.mockResolvedValue(
      response,
    );

    const result = await controller.reAllocateSelectedQuestions(
      mockUser as any,
      {
        questionIds: ['q1', 'q2'],
      } as any,
    );

    expect(result).toEqual(response);
  });

  it('calls balanceWorkloadSelectedQuestions exactly once', async () => {
    mockQuestionService.balanceWorkloadSelectedQuestions.mockResolvedValue({
      expertsInvolved: 1,
      submissionsProcessed: 1,
    });

    await controller.reAllocateSelectedQuestions(
      mockUser as any,
      {
        questionIds: ['q1'],
      } as any,
    );

    expect(
      mockQuestionService.balanceWorkloadSelectedQuestions,
    ).toHaveBeenCalledTimes(1);
  });
});
