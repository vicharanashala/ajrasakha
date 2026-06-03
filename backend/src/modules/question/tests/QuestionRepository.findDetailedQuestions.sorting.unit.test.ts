import 'reflect-metadata';
import {describe, it, expect, beforeEach} from 'vitest';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';
import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - sorting', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: async () => [
        {
          _id: '507f1f77bcf86cd799439011',
          question: 'Test Question',
          details: {},
        },
      ],
    });
  });

  it('applies created_desc sorting', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'created_desc',
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"createdAt":-1');
  });

  it('applies created_asc sorting', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'created_asc',
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"createdAt":1');
  });

  it('applies answers_desc sorting', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'answers_desc',
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"totalAnswersCount":-1');
  });

  it('applies answers_asc sorting', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'answers_asc',
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"totalAnswersCount":1');
  });

  it('applies priority_desc sorting', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'priority_desc',
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"priorityOrder":-1');
  });

  it('applies priority_asc sorting', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'priority_asc',
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"priorityOrder":1');
  });

  it('applies review_level_desc sorting', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'review_level_desc',
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"review_level_sort_value":-1');
  });

  it('applies review_level_asc sorting', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'review_level_asc',
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"review_level_sort_value":1');
  });

  it('defaults to created_desc sorting when sort is not provided', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"createdAt":-1');
  });

  it('calls countDocuments once', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'created_desc',
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls aggregate once', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      sort: 'created_desc',
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });
});
