import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError} from 'routing-controllers';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.reAllocateLessWorkload', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      balanceWorkload: vi.fn(),
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

  it('reallocates workload successfully', async () => {
    const response = {
      expertsInvolved: 5,
      submissionsProcessed: 20,
    };

    mockQuestionService.balanceWorkload.mockResolvedValue(response);

    const result = await controller.reAllocateLessWorkload(
      {
        _id: {
          toString: () => 'user-123',
        },
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'admin',
      } as any,
      'delayed',
    );

    expect(result).toEqual(response);
  });

  it('passes type parameter to service', async () => {
    mockQuestionService.balanceWorkload.mockResolvedValue({
      expertsInvolved: 1,
      submissionsProcessed: 1,
    });

    await controller.reAllocateLessWorkload(
      {
        _id: {
          toString: () => 'user-123',
        },
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'admin',
      } as any,
      'critical',
    );

    expect(mockQuestionService.balanceWorkload).toHaveBeenCalledWith(
      undefined,
      'critical',
    );
  });

  it('creates success audit trail', async () => {
    mockQuestionService.balanceWorkload.mockResolvedValue({
      expertsInvolved: 3,
      submissionsProcessed: 10,
    });

    await controller.reAllocateLessWorkload(
      {
        _id: {
          toString: () => 'user-123',
        },
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'admin',
      } as any,
      'delayed',
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);

    const auditPayload =
      mockAuditTrailsService.createAuditTrail.mock.calls[0][0];

    expect(auditPayload.outcome.status).toBe('SUCCESS');
  });

  it('throws BadRequestError when service fails', async () => {
    mockQuestionService.balanceWorkload.mockRejectedValue(
      new Error('Workload balancing failed'),
    );

    await expect(
      controller.reAllocateLessWorkload(
        {
          _id: {
            toString: () => 'user-123',
          },
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          role: 'admin',
        } as any,
        'delayed',
      ),
    ).rejects.toThrow(BadRequestError);

    await expect(
      controller.reAllocateLessWorkload(
        {
          _id: {
            toString: () => 'user-123',
          },
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          role: 'admin',
        } as any,
        'delayed',
      ),
    ).rejects.toThrow('Workload balancing failed');
  });

  it('creates failed audit trail when service fails', async () => {
    mockQuestionService.balanceWorkload.mockRejectedValue(
      new Error('Workload balancing failed'),
    );

    try {
      await controller.reAllocateLessWorkload(
        {
          _id: {
            toString: () => 'user-123',
          },
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          role: 'admin',
        } as any,
        'delayed',
      );
    } catch {}

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);

    const auditPayload =
      mockAuditTrailsService.createAuditTrail.mock.calls[0][0];

    expect(auditPayload.outcome.status).toBe('FAILED');
    expect(auditPayload.outcome.errorMessage).toBe('Workload balancing failed');
  });

  it('calls service exactly once', async () => {
    mockQuestionService.balanceWorkload.mockResolvedValue({
      expertsInvolved: 2,
      submissionsProcessed: 5,
    });

    await controller.reAllocateLessWorkload(
      {
        _id: {
          toString: () => 'user-123',
        },
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        role: 'admin',
      } as any,
      'delayed',
    );

    expect(mockQuestionService.balanceWorkload).toHaveBeenCalledTimes(1);
  });
});
