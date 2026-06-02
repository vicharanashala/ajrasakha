import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {InternalServerError} from 'routing-controllers';
import {ObjectId} from 'mongodb';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';
import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.getByContextId', () => {
  let repository: QuestionRepository;

  const validContextId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);
  });

  it('returns questions successfully', async () => {
    const questions = [
      {
        _id: new ObjectId(),
        userId: new ObjectId(),
        contextId: new ObjectId(),
        question: 'What is wheat?',
      },
      {
        _id: new ObjectId(),
        userId: new ObjectId(),
        contextId: new ObjectId(),
        question: 'What is rice?',
      },
    ];

    const mockToArray = vi.fn().mockResolvedValue(questions);

    mockQuestionCollection.find.mockReturnValue({
      toArray: mockToArray,
    });

    const result = await repository.getByContextId(validContextId);

    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('What is wheat?');
    expect(result[1].question).toBe('What is rice?');
  });

  it('converts ObjectIds to strings', async () => {
    const questionId = new ObjectId();
    const userId = new ObjectId();
    const contextId = new ObjectId();

    const mockToArray = vi.fn().mockResolvedValue([
      {
        _id: questionId,
        userId,
        contextId,
        question: 'What is wheat?',
      },
    ]);

    mockQuestionCollection.find.mockReturnValue({
      toArray: mockToArray,
    });

    const result = await repository.getByContextId(validContextId);

    expect(result[0]._id).toBe(questionId.toString());
    expect(result[0].userId).toBe(userId.toString());
    expect(result[0].contextId).toBe(contextId.toString());
  });

  it('calls find exactly once', async () => {
    const mockToArray = vi.fn().mockResolvedValue([]);

    mockQuestionCollection.find.mockReturnValue({
      toArray: mockToArray,
    });

    await repository.getByContextId(validContextId);

    expect(mockQuestionCollection.find).toHaveBeenCalledTimes(1);
  });

  it('passes context ObjectId to find', async () => {
    const mockToArray = vi.fn().mockResolvedValue([]);

    mockQuestionCollection.find.mockReturnValue({
      toArray: mockToArray,
    });

    await repository.getByContextId(validContextId);

    expect(mockQuestionCollection.find).toHaveBeenCalledWith(
      {
        context: new ObjectId(validContextId),
      },
      {
        session: undefined,
      },
    );
  });

  it('passes session to find', async () => {
    const session = {} as any;

    const mockToArray = vi.fn().mockResolvedValue([]);

    mockQuestionCollection.find.mockReturnValue({
      toArray: mockToArray,
    });

    await repository.getByContextId(validContextId, session);

    expect(mockQuestionCollection.find).toHaveBeenCalledWith(
      {
        context: new ObjectId(validContextId),
      },
      {
        session,
      },
    );
  });

  it('returns empty array when no questions exist', async () => {
    const mockToArray = vi.fn().mockResolvedValue([]);

    mockQuestionCollection.find.mockReturnValue({
      toArray: mockToArray,
    });

    const result = await repository.getByContextId(validContextId);

    expect(result).toEqual([]);
  });

  it('throws InternalServerError when contextId is invalid', async () => {
    await expect(repository.getByContextId('invalid-id')).rejects.toThrow(
      InternalServerError,
    );
  });

  it('throws InternalServerError when contextId is missing', async () => {
    await expect(repository.getByContextId('')).rejects.toThrow(
      InternalServerError,
    );
  });

  it('throws InternalServerError when find fails', async () => {
    mockQuestionCollection.find.mockImplementation(() => {
      throw new Error('Database failure');
    });

    await expect(repository.getByContextId(validContextId)).rejects.toThrow(
      InternalServerError,
    );
  });

  it('includes original error message when find fails', async () => {
    mockQuestionCollection.find.mockImplementation(() => {
      throw new Error('Database failure');
    });

    await expect(repository.getByContextId(validContextId)).rejects.toThrow(
      'Database failure',
    );
  });
});
