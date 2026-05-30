import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionController} from '../controllers/QuestionController.js';

describe('QuestionController.getByContextId', () => {
  let controller: QuestionController;

  let mockQuestionService: any;
  let mockUserService: any;
  let mockContextService: any;
  let mockAuditTrailsService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQuestionService = {
      getByContextId: vi.fn(),
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

  it('returns questions for context id', async () => {
    const questions = [
      {
        _id: 'q1',
        question: 'What is wheat?',
      },
      {
        _id: 'q2',
        question: 'What is rice?',
      },
    ];

    mockQuestionService.getByContextId.mockResolvedValue(questions);

    const result = await controller.getByContextId({
      contextId: 'context-123',
    } as any);

    expect(result).toEqual(questions);
  });

  it('passes context id to service', async () => {
    mockQuestionService.getByContextId.mockResolvedValue([]);

    await controller.getByContextId({
      contextId: 'context-123',
    } as any);

    expect(mockQuestionService.getByContextId).toHaveBeenCalledWith(
      'context-123',
    );
  });

  it('returns empty array when no questions exist', async () => {
    mockQuestionService.getByContextId.mockResolvedValue([]);

    const result = await controller.getByContextId({
      contextId: 'context-123',
    } as any);

    expect(result).toEqual([]);
  });

  it('calls service exactly once', async () => {
    mockQuestionService.getByContextId.mockResolvedValue([]);

    await controller.getByContextId({
      contextId: 'context-123',
    } as any);

    expect(mockQuestionService.getByContextId).toHaveBeenCalledTimes(1);
  });

  it('propagates service errors', async () => {
    mockQuestionService.getByContextId.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      controller.getByContextId({
        contextId: 'context-123',
      } as any),
    ).rejects.toThrow('Database failure');
  });
});
