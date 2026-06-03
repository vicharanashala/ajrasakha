import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - date filters', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('applies startTime filter', async () => {
    await repository.findDetailedQuestions({
      startTime: '2025-01-01',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.createdAt).toBeDefined();
    expect(filter.createdAt.$gte).toBeInstanceOf(Date);
  });

  it('applies endTime filter', async () => {
    await repository.findDetailedQuestions({
      endTime: '2025-12-31',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.createdAt).toBeDefined();
    expect(filter.createdAt.$lte).toBeDefined();
  });

  it('applies startTime and endTime together', async () => {
    await repository.findDetailedQuestions({
      startTime: '2025-01-01',
      endTime: '2025-12-31',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.createdAt.$gte).toBeDefined();
    expect(filter.createdAt.$lte).toBeDefined();
  });

  it('creates valid Date objects', async () => {
    await repository.findDetailedQuestions({
      startTime: '2025-01-01',
      endTime: '2025-12-31',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.createdAt.$gte).toBeInstanceOf(Date);
    expect(filter.createdAt.$lte).toBeInstanceOf(Date);
  });

  it('works with only startTime present', async () => {
    await repository.findDetailedQuestions({
      startTime: '2025-05-01',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.createdAt.$gte).toBeDefined();
    expect(filter.createdAt.$lte).toBeUndefined();
  });

  it('works with only endTime present', async () => {
    await repository.findDetailedQuestions({
      endTime: '2025-05-31',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.createdAt.$lte).toBeDefined();
    expect(filter.createdAt.$gte).toBeUndefined();
  });

  it('calls countDocuments once', async () => {
    await repository.findDetailedQuestions({
      startTime: '2025-01-01',
      endTime: '2025-12-31',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls aggregate once', async () => {
    await repository.findDetailedQuestions({
      startTime: '2025-01-01',
      endTime: '2025-12-31',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });
});
