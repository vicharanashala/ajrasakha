import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ObjectId} from 'mongodb';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';

import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.findDetailedQuestions - vector search', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);
  });

  it('uses vector search when semantic query and embedding are provided', async () => {
    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([{count: 1}]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: new ObjectId(),
            question: 'Wheat disease question',
            details: {},
          },
        ]),
      });

    await repository.findDetailedQuestions({
      search: 'how can i control yellow rust disease in wheat crop',
      searchEmbedding: [0.1, 0.2, 0.3],
      page: 1,
      limit: 10,
    } as any);

    const firstPipeline = mockQuestionCollection.aggregate.mock.calls[0][0];

    expect(JSON.stringify(firstPipeline)).toContain('$vectorSearch');
  });

  it('returns empty result when vector search count is zero', async () => {
    mockQuestionCollection.aggregate.mockReturnValueOnce({
      toArray: vi.fn().mockResolvedValue([{count: 0}]),
    });

    const result = await repository.findDetailedQuestions({
      search: 'how can i control yellow rust disease in wheat crop',
      searchEmbedding: [0.1, 0.2, 0.3],
      page: 1,
      limit: 10,
    } as any);

    expect(result).toEqual({
      questions: [],
      totalPages: 0,
      totalCount: 0,
    });
  });

  it('returns vector search results', async () => {
    const questionId = new ObjectId();

    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([{count: 1}]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: questionId,
            question: 'Question',
            details: {},
          },
        ]),
      });

    const result = await repository.findDetailedQuestions({
      search: 'how can i control yellow rust disease in wheat crop',
      searchEmbedding: [0.1, 0.2, 0.3],
      page: 1,
      limit: 10,
    } as any);

    expect(result.questions).toHaveLength(1);

    expect(result.questions[0]._id).toBe(questionId.toString());
  });

  it('calculates totalPages from vector search count', async () => {
    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([{count: 25}]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    const result = await repository.findDetailedQuestions({
      search: 'how can i control yellow rust disease in wheat crop',
      searchEmbedding: [0.1, 0.2, 0.3],
      page: 1,
      limit: 10,
    } as any);

    expect(result.totalPages).toBe(3);
  });

  it('includes filter match stage in vector search pipeline', async () => {
    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([{count: 1}]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    await repository.findDetailedQuestions({
      search: 'how can i control yellow rust disease in wheat crop',
      status: 'open',
      searchEmbedding: [0.1, 0.2, 0.3],
      page: 1,
      limit: 10,
    } as any);

    const pipeline = mockQuestionCollection.aggregate.mock.calls[1][0];

    expect(JSON.stringify(pipeline)).toContain('$match');
  });

  it('does not use vector search for short queries', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(0);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    await repository.findDetailedQuestions({
      search: 'wheat disease',
      searchEmbedding: [0.1, 0.2, 0.3],
      page: 1,
      limit: 10,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalled();
  });

  it('does not use vector search when embedding is null', async () => {
    mockQuestionCollection.countDocuments.mockResolvedValue(0);

    mockQuestionCollection.aggregate.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    await repository.findDetailedQuestions({
      search: 'how can i control yellow rust disease in wheat crop',
      searchEmbedding: null,
      page: 1,
      limit: 10,
    } as any);

    expect(mockQuestionCollection.countDocuments).toHaveBeenCalled();
  });

  it('calls aggregate twice during vector search', async () => {
    mockQuestionCollection.aggregate
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([{count: 1}]),
      })
      .mockReturnValueOnce({
        toArray: vi.fn().mockResolvedValue([]),
      });

    await repository.findDetailedQuestions({
      search: 'how can i control yellow rust disease in wheat crop',
      searchEmbedding: [0.1, 0.2, 0.3],
      page: 1,
      limit: 10,
    } as any);

    expect(mockQuestionCollection.aggregate).toHaveBeenCalledTimes(2);
  });
});
