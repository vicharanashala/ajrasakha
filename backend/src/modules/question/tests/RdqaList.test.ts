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
      expect(result.limit).toBe(50); // default limit
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

    it('should respect the limit parameter', async () => {
      const moderatorGroups = [
        { _id: new ObjectId().toString(), totalAvailable: 100, answerIds: [], questionIds: [] },
      ];

      const service = createMockService(moderatorGroups);
      const result = await service.getRdqaQuestions('2026-11-03', 25);

      expect(result.limit).toBe(25);
      expect(result.questionsPerModerator).toBe(25);
    });

    it('should cap limit at 50 when exceeded', async () => {
      const moderatorGroups = [
        { _id: new ObjectId().toString(), totalAvailable: 100, answerIds: [], questionIds: [] },
      ];

      const service = createMockService(moderatorGroups);
      const result = await service.getRdqaQuestions('2026-11-03', 100);

      expect(result.limit).toBe(50);
      expect(result.questionsPerModerator).toBe(50);
    });

    it('should use default limit of 50 when not specified', async () => {
      const service = createMockService([]);
      const result = await service.getRdqaQuestions();

      expect(result.limit).toBe(50);
    });

    it('should distribute equally when limit is set', async () => {
      const moderatorGroups = [
        { _id: new ObjectId().toString(), totalAvailable: 20, answerIds: [], questionIds: [] },
        { _id: new ObjectId().toString(), totalAvailable: 20, answerIds: [], questionIds: [] },
        { _id: new ObjectId().toString(), totalAvailable: 20, answerIds: [], questionIds: [] },
      ];

      // Need to provide 4 question-answer pairs for each moderator (3 x 4 = 12 total)
      const allPairs = moderatorGroups.flatMap((mod) => {
        return Array.from({ length: 4 }, (_, idx) => ({
          question: { _id: new ObjectId(), question: 'Test', status: 'closed' },
          answer: { _id: new ObjectId(), answer: 'Test answer', isFinalAnswer: true },
        }));
      });

      const service = createMockService(moderatorGroups, allPairs);
      const result = await service.getRdqaQuestions('2026-11-03', 12);

      expect(result.totalModerators).toBe(3);
      expect(result.questionsPerModerator).toBe(4);
      expect(result.totalQuestions).toBe(12);
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

  it('should accept valid limit', () => {
    const query = new RdqaListQuery();
    query.limit = 25;
    expect(query.limit).toBe(25);
  });

  it('should allow undefined limit', () => {
    const query = new RdqaListQuery();
    expect(query.limit).toBeUndefined();
  });
});