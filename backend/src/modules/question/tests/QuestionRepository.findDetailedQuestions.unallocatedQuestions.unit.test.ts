import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ObjectId} from 'mongodb';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - unallocated questions', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('runs unallocated aggregation when unallocatedQuestions=true', async () => {
    const questionId = new ObjectId();

    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: questionId,
          },
        ]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    await repository.findDetailedQuestions({
      unallocatedQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(2);
  });

  it('adds returned question ids to filter', async () => {
    const questionId = new ObjectId();

    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: questionId,
          },
        ]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    await repository.findDetailedQuestions({
      unallocatedQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const countFilter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(countFilter._id).toBeDefined();
    expect(countFilter._id.$in).toHaveLength(1);
    expect(countFilter._id.$in[0].toString()).toBe(questionId.toString());
  });

  it('uses lookup against question_submissions collection', async () => {
    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    await repository.findDetailedQuestions({
      unallocatedQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"from":"question_submissions"');
  });

  it('filters only open and delayed questions', async () => {
    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    await repository.findDetailedQuestions({
      unallocatedQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"open"');
    expect(JSON.stringify(pipeline)).toContain('"delayed"');
  });

  it('returns empty result when no unallocated questions exist', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(0);

    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    const result = await repository.findDetailedQuestions({
      unallocatedQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions).toEqual([]);
  });

  it('calls countDocuments once after applying unallocated filter', async () => {
    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    await repository.findDetailedQuestions({
      unallocatedQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls final aggregate once after count', async () => {
    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    await repository.findDetailedQuestions({
      unallocatedQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(2);
  });

  it('does not run unallocated aggregation when flag is false', async () => {
    await repository.findDetailedQuestions({
      unallocatedQuestions: 'false',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });
});
