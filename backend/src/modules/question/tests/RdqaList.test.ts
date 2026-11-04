import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { RdqaListQuery } from '../classes/validators/QuestionVaidators.js';
import { QuestionService } from '../services/QuestionService.js';

describe('RDQA List Service - Core Logic', () => {
  /**
   * Creates a mock service with controlled aggregate responses.
   * The first aggregate call returns moderator groups.
   * The second aggregate call returns question-answer pairs.
   */
  const createMockService = (
    moderatorGroups: any[],
    questionAnswerPairs: any[] = [],
  ) => {
    const service = Object.create(QuestionService.prototype);
    const aggregateMock = vi
      .fn()
      .mockResolvedValueOnce(moderatorGroups)
      .mockResolvedValue(questionAnswerPairs);
    (service as any).answerRepo = { aggregate: aggregateMock };
    return service;
  };

  describe('getRdqaQuestions', () => {
    it('should return empty result when no finalized answers exist', async () => {
      const service = createMockService([]);
      const result = await service.getRdqaQuestions();

      expect(result.totalModerators).toBe(0);
      expect(result.questionsPerModerator).toBe(0);
      expect(result.questions).toEqual([]);
    });

    it('should filter moderators with valid approvedBy only', async () => {
      const moderatorGroups = [
        { _id: new ObjectId().toString(), totalAvailable: 10, answerIds: [], questionIds: [] },
        { _id: new ObjectId().toString(), totalAvailable: 8, answerIds: [], questionIds: [] },
        { _id: null, totalAvailable: 5, answerIds: [], questionIds: [] },
      ];

      const service = createMockService(moderatorGroups);
      const result = await service.getRdqaQuestions('2026-11-03');

      expect(result.totalModerators).toBe(2);
      expect(result.questionsPerModerator).toBe(8);
    });

    it('should calculate equal distribution with counts 12, 10, 8, 9', async () => {
      const counts = [12, 10, 8, 9];
      const moderatorGroups = counts.map((count) => ({
        _id: new ObjectId().toString(),
        totalAvailable: count,
        answerIds: Array.from({ length: count }, () => new ObjectId()),
        questionIds: Array.from({ length: count }, () => new ObjectId()),
      }));

      // Mock 8 question-answer pairs for each moderator (4 moderators × 8 = 32 total)
      const questionAnswerPairs = moderatorGroups.flatMap((mod) =>
        mod.answerIds.slice(0, 8).map((answerId: ObjectId, idx: number) => ({
          question: { _id: mod.questionIds[idx], question: 'Test', status: 'closed' },
          answer: { _id: answerId, answer: 'Test answer', isFinalAnswer: true },
        })),
      );

      const service = createMockService(moderatorGroups, questionAnswerPairs);
      const result = await service.getRdqaQuestions('2026-11-03');

      expect(result.totalModerators).toBe(4);
      expect(result.questionsPerModerator).toBe(8);
      expect(result.totalQuestions).toBe(32);
    });

    it('should handle single moderator', async () => {
      const moderatorGroups = [{
        _id: new ObjectId().toString(),
        totalAvailable: 15,
        answerIds: Array.from({ length: 15 }, () => new ObjectId()),
        questionIds: Array.from({ length: 15 }, () => new ObjectId()),
      }];

      const service = createMockService(moderatorGroups);
      const result = await service.getRdqaQuestions('2026-11-03');

      expect(result.totalModerators).toBe(1);
      expect(result.questionsPerModerator).toBe(15);
    });

    it('should use provided date string', async () => {
      const service = createMockService([]);
      const result = await service.getRdqaQuestions('2026-11-03');

      expect(result.date).toBe('2026-11-03');
    });
  });
});

describe('RdqaListQuery Validator', () => {
  it('should accept valid date string', () => {
    const query = new RdqaListQuery();
    query.date = '2026-11-03';
    expect(query.date).toBe('2026-11-03');
  });

  it('should allow undefined date', () => {
    const query = new RdqaListQuery();
    expect(query.date).toBeUndefined();
  });
});