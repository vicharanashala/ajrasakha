import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  mockQuestionSubmissionCollection,
  resetCollections,
} from './mocks/collections.mock.js';
import {ObjectId} from 'mongodb';

describe('QuestionRepository.findDetailedQuestions - filters', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('applies status filter', async () => {
    await repository.findDetailedQuestions({
      status: 'open',
      page: 1,
      limit: 10,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('open');
  });

  it('applies state filter', async () => {
    await repository.findDetailedQuestions(
      {
        page: 1,
        limit: 10,
        searchEmbedding: null,
      } as any,
      {
        states: ['Punjab'],
      } as any,
    );

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('Punjab');
  });

  it('applies crop filter', async () => {
    await repository.findDetailedQuestions({
      crop: ['Wheat'],
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('Wheat');
  });

  it('applies domain filter', async () => {
    await repository.findDetailedQuestions({
      domain: 'Agriculture',
      page: 1,
      limit: 10,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('Agriculture');
  });

  it('applies source filter', async () => {
    await repository.findDetailedQuestions({
      source: 'WhatsApp',
      page: 1,
      limit: 10,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('WhatsApp');
  });

  it('applies priority filter', async () => {
    await repository.findDetailedQuestions({
      priority: 'high',
      page: 1,
      limit: 10,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('high');
  });

  it('applies user filter', async () => {
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
      user: '507f1f77bcf86cd799439011',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionSubmissionCollection.find).toHaveBeenCalledWith({
      'history.updatedBy': new ObjectId('507f1f77bcf86cd799439011'),
    });
  });

  it('applies pae_review true filter', async () => {
    await repository.findDetailedQuestions({
      pae_review: true,
      page: 1,
      limit: 10,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('pae_review');
  });

  it('applies pae_review false filter', async () => {
    await repository.findDetailedQuestions({
      pae_review: false,
      page: 1,
      limit: 10,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('pae_review');
  });

  it('always excludes held questions', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(JSON.stringify(filter)).toContain('isOnHold');
  });

  it('calls countDocuments once', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls aggregate once', async () => {
    await repository.findDetailedQuestions({
      page: 1,
      limit: 10,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });
});
