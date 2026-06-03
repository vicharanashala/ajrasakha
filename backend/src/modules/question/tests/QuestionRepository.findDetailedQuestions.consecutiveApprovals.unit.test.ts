import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ObjectId} from 'mongodb';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  mockAnswersCollection,
  mockQuestionSubmissionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - consecutive approvals', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('filters questions by approval count', async () => {
    const questionId = new ObjectId();

    mockAnswersCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          questionId,
        },
      ]),
    });

    await repository.findDetailedQuestions({
      consecutiveApprovals: '3',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockAnswersCollection.aggregate).toHaveBeenCalled();
  });

  it('returns empty result when no answers match approval count', async () => {
    mockAnswersCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const result = await repository.findDetailedQuestions({
      consecutiveApprovals: '5',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result).toEqual({
      questions: [],
      totalPages: 0,
      totalCount: 0,
    });
  });

  it('intersects approval count ids with existing filters', async () => {
    const questionId = new ObjectId();

    mockAnswersCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          questionId,
        },
      ]),
    });

    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            questionId,
          },
        ]),
      }),
    });

    await repository.findDetailedQuestions({
      consecutiveApprovals: '2',
      user: '507f1f77bcf86cd799439011',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockAnswersCollection.aggregate).toHaveBeenCalledTimes(1);
  });

  it('passes approval count to answer aggregation pipeline', async () => {
    mockAnswersCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    await repository.findDetailedQuestions({
      consecutiveApprovals: '4',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const pipeline = mockAnswersCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain(
      '"latestAnswer.approvalCount":4',
    );
  });

  it('continues to aggregate when approvals exist', async () => {
    mockAnswersCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          questionId: new ObjectId(),
        },
      ]),
    });

    await repository.findDetailedQuestions({
      consecutiveApprovals: '1',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });

  it('calls answers collection only once', async () => {
    mockAnswersCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          questionId: new ObjectId(),
        },
      ]),
    });

    await repository.findDetailedQuestions({
      consecutiveApprovals: '1',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockAnswersCollection.aggregate).toHaveBeenCalledTimes(1);
  });

  it('supports approval count of zero', async () => {
    mockAnswersCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          questionId: new ObjectId(),
        },
      ]),
    });

    await repository.findDetailedQuestions({
      consecutiveApprovals: '0',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockAnswersCollection.aggregate).toHaveBeenCalled();
  });

  it('ignores approval filtering when consecutiveApprovals is null', async () => {
    await repository.findDetailedQuestions({
      consecutiveApprovals: null,
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockAnswersCollection.aggregate).not.toHaveBeenCalled();
  });
});
