import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {InternalServerError} from 'routing-controllers';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  mockQuestionSubmissionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - errors', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);
  });

  it('throws InternalServerError when countDocuments fails', async () => {
    mockQuestionCollection.countDocuments.mockRejectedValue(
      new Error('count failed'),
    );

    await expect(
      repository.findDetailedQuestions({
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it('includes countDocuments error message', async () => {
    mockQuestionCollection.countDocuments.mockRejectedValue(
      new Error('count failed'),
    );

    await expect(
      repository.findDetailedQuestions({
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any),
    ).rejects.toThrow('count failed');
  });

  it('throws InternalServerError when aggregate fails', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockImplementation(() => {
      throw new Error('aggregate failed');
    });

    await expect(
      repository.findDetailedQuestions({
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it('includes aggregate error message', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockImplementation(() => {
      throw new Error('aggregate failed');
    });

    await expect(
      repository.findDetailedQuestions({
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any),
    ).rejects.toThrow('aggregate failed');
  });

  it('throws when user submission lookup fails', async () => {
    mockQuestionSubmissionCollection.find.mockImplementation(() => {
      throw new Error('submission lookup failed');
    });

    await expect(
      repository.findDetailedQuestions({
        user: '507f1f77bcf86cd799439011',
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it('throws when review level lookup fails', async () => {
    mockQuestionSubmissionCollection.find.mockImplementation(() => {
      throw new Error('review level failed');
    });

    await expect(
      repository.findDetailedQuestions({
        review_level: 'Level 1',
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it('throws when vector search aggregate fails', async () => {
    mockQuestionCollection.aggregate.mockImplementation(() => {
      throw new Error('vector search failed');
    });

    await expect(
      repository.findDetailedQuestions({
        search: 'this is a very long semantic search query for testing',
        searchEmbedding: [0.1, 0.2, 0.3],
        page: 1,
        limit: 10,
      } as any),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it('includes vector search error message', async () => {
    mockQuestionCollection.aggregate.mockImplementation(() => {
      throw new Error('vector search failed');
    });

    await expect(
      repository.findDetailedQuestions({
        search: 'this is a very long semantic search query for testing',
        searchEmbedding: [0.1, 0.2, 0.3],
        page: 1,
        limit: 10,
      } as any),
    ).rejects.toThrow('vector search failed');
  });
});
