import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - visibility filters', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('applies hiddenQuestions filter', async () => {
    await repository.findDetailedQuestions({
      hiddenQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.isHidden).toEqual({
      $eq: true,
    });
  });

  it('applies hidden filter when status is pass', async () => {
    await repository.findDetailedQuestions({
      status: 'pass',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.isHidden).toEqual({
      $eq: true,
    });
  });

  it('applies on hold filter', async () => {
    await repository.findDetailedQuestions({
      isOnHold: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.isOnHold).toEqual({
      $eq: true,
    });
  });

  it('defaults to excluding held questions', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.isOnHold).toEqual({
      $ne: true,
    });
  });

  it('does not apply hidden filter by default', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.isHidden).toBeUndefined();
  });

  it('calls countDocuments once', async () => {
    await repository.findDetailedQuestions({
      hiddenQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls aggregate once', async () => {
    await repository.findDetailedQuestions({
      hiddenQuestions: 'true',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });
});
