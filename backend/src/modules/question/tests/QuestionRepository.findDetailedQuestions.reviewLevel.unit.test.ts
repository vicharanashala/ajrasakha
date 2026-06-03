import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {ObjectId} from 'mongodb';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  mockQuestionSubmissionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - review level', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('returns empty result when no submissions match review level', async () => {
    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await repository.findDetailedQuestions({
      review_level: 'Level 1',
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

  it('applies Level 1 filter', async () => {
    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            questionId: new ObjectId(),
          },
        ]),
      }),
    });

    await repository.findDetailedQuestions({
      review_level: 'Level 1',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionSubmissionCollection.find).toHaveBeenCalledWith(
      expect.objectContaining({
        history: {
          $size: 2,
        },
        'history.1.status': 'in-review',
      }),
    );
  });

  it('applies Level 2 filter', async () => {
    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            questionId: new ObjectId(),
          },
        ]),
      }),
    });

    await repository.findDetailedQuestions({
      review_level: 'Level 2',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionSubmissionCollection.find).toHaveBeenCalledWith(
      expect.objectContaining({
        history: {
          $size: 3,
        },
        'history.2.status': 'in-review',
      }),
    );
  });

  it('applies Author review level filter', async () => {
    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            questionId: new ObjectId(),
          },
        ]),
      }),
    });

    await repository.findDetailedQuestions({
      review_level: 'Level 0',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionSubmissionCollection.find).toHaveBeenCalledWith({
      history: {
        $size: 0,
      },
    });
  });

  it('intersects existing _id filter with review level filter', async () => {
    const questionId = new ObjectId();

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
      review_level: 'Level 1',
      user: '507f1f77bcf86cd799439011',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionSubmissionCollection.find).toHaveBeenCalled();
  });

  it('calls submission collection once', async () => {
    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            questionId: new ObjectId(),
          },
        ]),
      }),
    });

    await repository.findDetailedQuestions({
      review_level: 'Level 1',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionSubmissionCollection.find).toHaveBeenCalledTimes(1);
  });

  it('continues to aggregate after review level filtering', async () => {
    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            questionId: new ObjectId(),
          },
        ]),
      }),
    });

    await repository.findDetailedQuestions({
      review_level: 'Level 1',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });
});
