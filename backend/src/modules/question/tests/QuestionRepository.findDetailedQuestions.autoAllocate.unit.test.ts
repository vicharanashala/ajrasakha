import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - auto allocation', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('applies auto allocation filter', async () => {
    await repository.findDetailedQuestions({
      autoAllocateFilter: 'on',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.isAutoAllocate).toBe(true);
  });

  it('applies manual allocation filter', async () => {
    await repository.findDetailedQuestions({
      autoAllocateFilter: 'off',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.isAutoAllocate).toBe(false);
  });

  it('does not apply allocation filter when not provided', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).not.toContain('isAutoAllocate');
  });

  it('calls countDocuments once', async () => {
    await repository.findDetailedQuestions({
      autoAllocateFilter: 'auto',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls aggregate once', async () => {
    await repository.findDetailedQuestions({
      autoAllocateFilter: 'auto',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });
});
