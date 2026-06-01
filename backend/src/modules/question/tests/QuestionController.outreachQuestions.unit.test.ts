import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.outreachQuestions', () => {
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
    avatar: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      sendOutReachQuestionsMail: vi.fn(),
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

  it('sends outreach questions successfully', async () => {
    const body = {
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      emails: ['test@example.com'],
    };

    const response = {
      success: true,
      message: 'Mail sent',
    };

    mockQuestionService.sendOutReachQuestionsMail.mockResolvedValue(response);

    const result = await controller.outreachQuestions(
      body as any,
      mockUser as any,
    );

    expect(mockQuestionService.sendOutReachQuestionsMail).toHaveBeenCalledWith(
      '2025-01-01',
      '2025-01-31',
      ['test@example.com'],
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);

    expect(result).toEqual(response);
  });

  it('creates success audit trail', async () => {
    mockQuestionService.sendOutReachQuestionsMail.mockResolvedValue({
      success: true,
    });

    await controller.outreachQuestions(
      {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        emails: ['test@example.com'],
      } as any,
      mockUser as any,
    );

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);

    const auditPayload =
      mockAuditTrailsService.createAuditTrail.mock.calls[0][0];

    expect(auditPayload.actor.email).toBe('john@test.com');
    expect(auditPayload.context.recepients).toEqual(['test@example.com']);
  });

  it('rethrows service errors', async () => {
    const error = new Error('Mail service unavailable');

    mockQuestionService.sendOutReachQuestionsMail.mockRejectedValue(error);

    await expect(
      controller.outreachQuestions(
        {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          emails: ['test@example.com'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow('Mail service unavailable');
  });

  it('creates failure audit trail when service fails', async () => {
    mockQuestionService.sendOutReachQuestionsMail.mockRejectedValue(
      new Error('Mail service unavailable'),
    );

    await expect(
      controller.outreachQuestions(
        {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          emails: ['test@example.com'],
        } as any,
        mockUser as any,
      ),
    ).rejects.toThrow();

    expect(mockAuditTrailsService.createAuditTrail).toHaveBeenCalledTimes(1);

    const auditPayload =
      mockAuditTrailsService.createAuditTrail.mock.calls[0][0];

    expect(auditPayload.outcome.status).toBe('FAILED');
    expect(auditPayload.outcome.errorMessage).toContain(
      'Mail service unavailable',
    );
  });

  it('passes multiple email recipients correctly', async () => {
    const emails = ['user1@test.com', 'user2@test.com', 'user3@test.com'];

    mockQuestionService.sendOutReachQuestionsMail.mockResolvedValue({
      success: true,
    });

    await controller.outreachQuestions(
      {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        emails,
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.sendOutReachQuestionsMail).toHaveBeenCalledWith(
      '2025-01-01',
      '2025-01-31',
      emails,
    );
  });

  it('calls service exactly once', async () => {
    mockQuestionService.sendOutReachQuestionsMail.mockResolvedValue({
      success: true,
    });

    await controller.outreachQuestions(
      {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        emails: ['test@example.com'],
      } as any,
      mockUser as any,
    );

    expect(mockQuestionService.sendOutReachQuestionsMail).toHaveBeenCalledTimes(
      1,
    );
  });
});
