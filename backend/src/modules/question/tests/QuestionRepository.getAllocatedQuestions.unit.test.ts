import 'reflect-metadata';
import {describe, it, expect, beforeEach} from 'vitest';
import {InternalServerError} from 'routing-controllers';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';
import {
  mockQuestionCollection,
  mockQuestionSubmissionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.getAllocatedQuestions', () => {
  let repository: QuestionRepository;

  const userId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);
  });

  it('returns allocated questions successfully', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          questionId: '507f1f77bcf86cd799439012',
        },
      ],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          id: '507f1f77bcf86cd799439012',
          text: 'What is wheat?',
          priority: 'high',
        },
      ],
    });

    const result = await repository.getAllocatedQuestions(userId, {
      page: 1,
      limit: 10,
      review_level: 'all',
    } as any);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('What is wheat?');
  });

  it('returns empty array when no submissions exist', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    const result = await repository.getAllocatedQuestions(userId, {
      page: 1,
      limit: 10,
      review_level: 'all',
    } as any);

    expect(result).toEqual([]);
  });

  it('calls submission aggregate exactly once', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(userId, {
      page: 1,
      limit: 10,
      review_level: 'all',
    } as any);

    expect(mockQuestionSubmissionCollection.aggregate).toHaveBeenCalledTimes(1);
  });

  it('calls question aggregate exactly once', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(userId, {
      page: 1,
      limit: 10,
      review_level: 'all',
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });

  it('applies source filter', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          questionId: '507f1f77bcf86cd799439012',
        },
      ],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(userId, {
      page: 1,
      limit: 10,
      review_level: 'all',
      source: 'mobile',
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('mobile');
  });

  it('applies state filter', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          questionId: '507f1f77bcf86cd799439012',
        },
      ],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(
      userId,
      {
        page: 1,
        limit: 10,
        review_level: 'all',
      } as any,
      undefined,
      {
        states: ['Punjab'],
      } as any,
    );

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('details.state');
  });

  it('applies crop filter', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          questionId: '507f1f77bcf86cd799439012',
        },
      ],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(
      userId,
      {
        page: 1,
        limit: 10,
        review_level: 'all',
      } as any,
      undefined,
      {
        crops: ['Wheat'],
      } as any,
    );

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('details.crop');
  });

  it('applies skip pagination', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          questionId: '507f1f77bcf86cd799439012',
        },
      ],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(userId, {
      page: 2,
      limit: 10,
      review_level: 'all',
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(pipeline).toContainEqual({
      $skip: 10,
    });
  });

  it('applies limit pagination', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          questionId: '507f1f77bcf86cd799439012',
        },
      ],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(userId, {
      page: 1,
      limit: 25,
      review_level: 'all',
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(pipeline).toContainEqual({
      $limit: 25,
    });
  });

  it('adds priority sort stage', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          questionId: '507f1f77bcf86cd799439012',
        },
      ],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(userId, {
      page: 1,
      limit: 10,
      review_level: 'all',
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(
      pipeline.some((stage: any) => stage.$sort?.priorityOrder === 1),
    ).toBe(true);
  });

  it('passes session to aggregate', async () => {
    const session = {} as any;

    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [],
    });

    await repository.getAllocatedQuestions(
      userId,
      {
        page: 1,
        limit: 10,
        review_level: 'all',
      } as any,
      session,
    );

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledWith(
      expect.any(Array),
      {session},
    );
  });

  it('throws InternalServerError when submission aggregate fails', async () => {
    mockQuestionSubmissionCollection.aggregate.mockImplementation(() => {
      throw new Error('DB failure');
    });

    await expect(
      repository.getAllocatedQuestions(userId, {
        page: 1,
        limit: 10,
        review_level: 'all',
      } as any),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when question aggregate fails', async () => {
    mockQuestionSubmissionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          questionId: '507f1f77bcf86cd799439012',
        },
      ],
    });

    mockQuestionCollection.aggregate.mockImplementation(() => {
      throw new Error('DB failure');
    });

    await expect(
      repository.getAllocatedQuestions(userId, {
        page: 1,
        limit: 10,
        review_level: 'all',
      } as any),
    ).rejects.toThrow(InternalServerError);
  });

  it('includes original error message when aggregate fails', async () => {
    mockQuestionSubmissionCollection.aggregate.mockImplementation(() => {
      throw new Error('DB failure');
    });

    await expect(
      repository.getAllocatedQuestions(userId, {
        page: 1,
        limit: 10,
        review_level: 'all',
      } as any),
    ).rejects.toThrow('DB failure');
  });
});
