import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - pagination', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('calculates totalPages correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(25);

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.totalPages).toBe(3);
  });

  it('returns totalCount correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(37);

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.totalCount).toBe(37);
  });

  it('applies page 1 correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(10);

    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"$skip":0');
  });

  it('applies page 2 correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(30);

    await repository.findDetailedQuestions({
      page: 2,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"$skip":10');
  });

  it('applies page 3 correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(30);

    await repository.findDetailedQuestions({
      page: 3,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"$skip":20');
  });

  it('applies custom limit correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(50);

    await repository.findDetailedQuestions({
      page: 1,
      limit: 25,
      searchEmbedding: null,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(pipeline)).toContain('"$limit":25');
  });

  it('returns empty result set correctly', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(0);

    const result = await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions).toEqual([]);
    expect(result.totalPages).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  it('calls countDocuments exactly once', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(10);

    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls aggregate exactly once', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(10);

    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });
});
