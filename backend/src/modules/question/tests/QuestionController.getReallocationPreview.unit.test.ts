import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getReallocationPreview', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getReallocationPreview: vi.fn(),
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

  it('returns reallocation preview successfully', async () => {
    const response = {
      questions: [
        {
          questionId: 'question-1',
          currentExpert: 'expert-1',
        },
      ],
      experts: [
        {
          expertId: 'expert-2',
          workload: 3,
        },
      ],
    };

    mockQuestionService.getReallocationPreview.mockResolvedValue(response);

    const result = await controller.getReallocationPreview('delayed');

    expect(result).toEqual(response);
  });

  it('passes type parameter to service', async () => {
    mockQuestionService.getReallocationPreview.mockResolvedValue({});

    await controller.getReallocationPreview('critical');

    expect(mockQuestionService.getReallocationPreview).toHaveBeenCalledWith(
      'critical',
    );
  });

  it('returns empty response when service returns empty data', async () => {
    mockQuestionService.getReallocationPreview.mockResolvedValue({
      questions: [],
      experts: [],
    });

    const result = await controller.getReallocationPreview('delayed');

    expect(result).toEqual({
      questions: [],
      experts: [],
    });
  });

  it('propagates service errors', async () => {
    mockQuestionService.getReallocationPreview.mockRejectedValue(
      new Error('Failed to generate preview'),
    );

    await expect(controller.getReallocationPreview('delayed')).rejects.toThrow(
      'Failed to generate preview',
    );
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getReallocationPreview.mockResolvedValue({});

    await controller.getReallocationPreview('delayed');

    expect(mockQuestionService.getReallocationPreview).toHaveBeenCalledTimes(1);
  });

  it('supports undefined type', async () => {
    mockQuestionService.getReallocationPreview.mockResolvedValue({});

    await controller.getReallocationPreview(undefined as any);

    expect(mockQuestionService.getReallocationPreview).toHaveBeenCalledWith(
      undefined,
    );
  });
});
