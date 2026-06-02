import 'reflect-metadata';
import {describe, it, expect, beforeEach} from 'vitest';
import {InternalServerError} from 'routing-controllers';
import {ObjectId} from 'mongodb';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';
import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(0);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });
  });

  it('returns empty result when no questions exist', async () => {
    const result = await repository.findDetailedQuestions({
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

  it('formats question ids as strings', async () => {
    const questionId = new ObjectId();

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          _id: questionId,
          question: 'What is wheat?',
          details: {
            state: 'Punjab',
          },
        },
      ],
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions[0]._id).toBe(questionId.toString());
  });

  it('returns question details', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          _id: new ObjectId(),
          question: 'What is wheat?',
          details: {
            state: 'Punjab',
            crop: 'Wheat',
          },
        },
      ],
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question).toBe('What is wheat?');
  });

  it('calculates total pages correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(25);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.totalPages).toBe(3);
  });

  it('calls countDocuments exactly once', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls aggregate exactly once', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });

  it('excludes on hold questions by default', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnHold: {
          $ne: true,
        },
      }),
    );
  });

  it('applies hidden questions filter', async () => {
    await repository.findDetailedQuestions({
      hiddenQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        isHidden: {
          $eq: true,
        },
      }),
    );
  });

  it('applies on hold filter', async () => {
    await repository.findDetailedQuestions({
      isOnHold: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnHold: {
          $eq: true,
        },
      }),
    );
  });

  it('applies auto allocate on filter', async () => {
    await repository.findDetailedQuestions({
      autoAllocateFilter: 'on',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        isAutoAllocate: true,
      }),
    );
  });

  it('applies auto allocate off filter', async () => {
    await repository.findDetailedQuestions({
      autoAllocateFilter: 'off',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        isAutoAllocate: false,
      }),
    );
  });

  it('applies status filter', async () => {
    await repository.findDetailedQuestions({
      status: 'open',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        status: {
          $regex: '^open$',
          $options: 'i',
        },
      }),
    );
  });

  it('applies source filter', async () => {
    await repository.findDetailedQuestions({
      source: 'mobile',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          $regex: '^mobile$',
          $options: 'i',
        },
      }),
    );
  });

  it('applies priority filter', async () => {
    await repository.findDetailedQuestions({
      priority: 'high',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: {
          $regex: '^high$',
          $options: 'i',
        },
      }),
    );
  });

  it('applies answers count range filter', async () => {
    await repository.findDetailedQuestions({
      answersCountMin: 1,
      answersCountMax: 10,
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAnswersCount: {
          $gte: 1,
          $lte: 10,
        },
      }),
    );
  });

  it('applies states filter from body', async () => {
    await repository.findDetailedQuestions(
      {
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any,
      {
        states: ['Punjab', 'Haryana'],
      } as any,
    );

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        'details.state': {
          $in: ['Punjab', 'Haryana'],
        },
      }),
    );
  });

  it('throws InternalServerError when countDocuments fails', async () => {
    mockQuestionCollection.countDocuments.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      repository.findDetailedQuestions({
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any),
    ).rejects.toThrow(InternalServerError);
  });

  it('includes original error message when countDocuments fails', async () => {
    mockQuestionCollection.countDocuments.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      repository.findDetailedQuestions({
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any),
    ).rejects.toThrow('Database failure');
  });
});
