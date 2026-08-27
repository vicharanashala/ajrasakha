import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getQuestionStatusSummary', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getQuestionStatusSummary: vi.fn(),
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

  it('returns status summary successfully', async () => {
    const summary = {
      total: 100,
      open: 50,
      closed: 30,
      pending: 20,
    };

    mockQuestionService.getQuestionStatusSummary.mockResolvedValue(summary);

    const result = await controller.getQuestionStatusSummary(
      {page: 1} as any,
      {status: 'open'} as any,
    );

    expect(result).toEqual({
      success: true,
      data: summary,
    });
  });

  it('passes query and body to service', async () => {
    const query = {
      page: 1,
      limit: 10,
    };

    const body = {
      status: 'open',
      priority: 'high',
    };

    mockQuestionService.getQuestionStatusSummary.mockResolvedValue({});

    await controller.getQuestionStatusSummary(query as any, body as any);

    expect(mockQuestionService.getQuestionStatusSummary).toHaveBeenCalledWith(
      query,
      body,
    );
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getQuestionStatusSummary.mockResolvedValue({});

    await controller.getQuestionStatusSummary({} as any, {} as any);

    expect(mockQuestionService.getQuestionStatusSummary).toHaveBeenCalledTimes(
      1,
    );
  });

  it('propagates service errors', async () => {
    mockQuestionService.getQuestionStatusSummary.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      controller.getQuestionStatusSummary({} as any, {} as any),
    ).rejects.toThrow('Database failure');
  });
});
