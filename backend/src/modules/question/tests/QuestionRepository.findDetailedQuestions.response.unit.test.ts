import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ObjectId} from 'mongodb';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - response mapping', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);
  });

  it('converts _id to string', async () => {
    const questionId = new ObjectId();

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: questionId,
          question: 'Test Question',
          details: {},
        },
      ]),
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions[0]._id).toBe(questionId.toString());
  });

  it('preserves details object', async () => {
    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: new ObjectId(),
          details: {
            state: 'Punjab',
            crop: 'Wheat',
          },
        },
      ]),
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions[0].details).toEqual({
      state: 'Punjab',
      crop: 'Wheat',
    });
  });

  it('preserves status field', async () => {
    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: new ObjectId(),
          status: 'open',
          details: {},
        },
      ]),
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions[0].status).toBe('open');
  });

  it('preserves priority field', async () => {
    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: new ObjectId(),
          priority: 'high',
          details: {},
        },
      ]),
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions[0].priority).toBe('high');
  });

  it('preserves review_level_number', async () => {
    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: new ObjectId(),
          review_level_number: 2,
          details: {},
        },
      ]),
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    // expect(result.questions[0].review_level_number).toBe(2);
    expect((result.questions[0] as any).review_level_number).toBe(2);
  });

  it('returns totalCount', async () => {
    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.totalCount).toBe(1);
  });

  it('calculates totalPages correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(25);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.totalPages).toBe(3);
  });

  it('returns formatted questions array', async () => {
    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: new ObjectId(),
          question: 'Question 1',
          details: {},
        },
        {
          _id: new ObjectId(),
          question: 'Question 2',
          details: {},
        },
      ]),
    });

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions).toHaveLength(2);
  });
});
