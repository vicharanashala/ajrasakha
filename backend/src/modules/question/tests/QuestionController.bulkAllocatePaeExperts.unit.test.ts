import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.bulkAllocatePaeExperts', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      bulkAllocatePaeExperts: vi.fn(),
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

  it('bulk allocates PAE expert successfully', async () => {
    const response = {
      success: true,
      allocatedCount: 3,
    };

    mockQuestionService.bulkAllocatePaeExperts.mockResolvedValue(response);

    const result = await controller.bulkAllocatePaeExperts(
      {
        questionIds: ['q1', 'q2', 'q3'],
        paeExpertId: 'expert-123',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.bulkAllocatePaeExperts).toHaveBeenCalledWith(
      'user-123',
      ['q1', 'q2', 'q3'],
      'expert-123',
    );

    expect(result).toEqual(response);
  });

  it('passes empty question list', async () => {
    mockQuestionService.bulkAllocatePaeExperts.mockResolvedValue({
      success: true,
    });

    await controller.bulkAllocatePaeExperts(
      {
        questionIds: [],
        paeExpertId: 'expert-123',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.bulkAllocatePaeExperts).toHaveBeenCalledWith(
      'user-123',
      [],
      'expert-123',
    );
  });

  it('calls service once', async () => {
    mockQuestionService.bulkAllocatePaeExperts.mockResolvedValue({
      success: true,
    });

    await controller.bulkAllocatePaeExperts(
      {
        questionIds: ['q1'],
        paeExpertId: 'expert-123',
      } as any,
      {
        _id: {
          toString: () => 'user-123',
        },
      } as any,
    );

    expect(mockQuestionService.bulkAllocatePaeExperts).toHaveBeenCalledTimes(1);
  });
});
