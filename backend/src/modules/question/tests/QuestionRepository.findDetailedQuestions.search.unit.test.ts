import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  mockQuestionSubmissionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - search', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);

    mockQuestionCollection.countDocuments.mockResolvedValue(1);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
  });

  it('applies question search filter', async () => {
    await repository.findDetailedQuestions({
      search: 'wheat',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.$and).toBeDefined();
    expect(filter.$and.length).toBe(2);

    expect(JSON.stringify(filter)).toContain('wheat');
  });

  it('escapes regex characters in search', async () => {
    await repository.findDetailedQuestions({
      search: 'what?',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    // expect(JSON.stringify(filter)).toContain('what');
    const searchOr = filter.$and[1].$or;

    expect(searchOr[0].question.$regex).toBe('what\\?');
  });

  it('combines search filter with existing pae_review filter', async () => {
    await repository.findDetailedQuestions({
      search: 'rice',
      pae_review: false,
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    const filter = mockQuestionCollection.countDocuments.mock.calls[0][0];

    expect(filter.$and).toBeDefined();
  });

  it('returns empty result when user has no submissions', async () => {
    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await repository.findDetailedQuestions({
      user: '507f1f77bcf86cd799439011',
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

  it('applies user filter correctly', async () => {
    mockQuestionSubmissionCollection.find.mockReturnValue({
      project: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          {
            questionId: '507f1f77bcf86cd799439012',
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

    expect(mockQuestionSubmissionCollection.find).toHaveBeenCalledTimes(1);
  });

  it('calls countDocuments once', async () => {
    await repository.findDetailedQuestions({
      search: 'cotton',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls aggregate once', async () => {
    await repository.findDetailedQuestions({
      search: 'cotton',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(1);
  });

  it('returns formatted questions', async () => {
    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: {
            toString: () => 'question-1',
          },
          details: {
            crop: 'Wheat',
          },
        },
      ]),
    });

    const result = await repository.findDetailedQuestions({
      search: 'wheat',
      page: 1,
      limit: 10,
      searchEmbedding: null,
    } as any);

    expect(result.questions[0]._id).toBe('question-1');
  });
});
