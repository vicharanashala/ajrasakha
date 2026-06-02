import 'reflect-metadata';
import {describe, it, expect, beforeEach} from 'vitest';
import {InternalServerError} from 'routing-controllers';
import {ObjectId} from 'mongodb';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';
import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.getById', () => {
  let repository: QuestionRepository;

  const validQuestionId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);
  });

  it('returns question successfully', async () => {
    const question = {
      _id: new ObjectId(),
      userId: new ObjectId(),
      contextId: new ObjectId(),
      question: 'What is wheat?',
      status: 'open',
    };

    mockQuestionCollection.findOne.mockResolvedValue(question);

    const result = await repository.getById(validQuestionId);

    expect(result.question).toBe('What is wheat?');
    expect(result.status).toBe('open');
  });

  it('converts ObjectIds to strings', async () => {
    const questionId = new ObjectId();
    const userId = new ObjectId();
    const contextId = new ObjectId();

    mockQuestionCollection.findOne.mockResolvedValue({
      _id: questionId,
      userId,
      contextId,
      question: 'What is wheat?',
    });

    const result = await repository.getById(validQuestionId);

    expect(result._id).toBe(questionId.toString());
    expect(result.userId).toBe(userId.toString());
    expect(result.contextId).toBe(contextId.toString());
  });

  it('calls findOne exactly once', async () => {
    mockQuestionCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      question: 'What is wheat?',
    });

    await repository.getById(validQuestionId);

    expect(mockQuestionCollection.findOne).toHaveBeenCalledTimes(1);
  });

  it('passes question id to findOne', async () => {
    mockQuestionCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      question: 'What is wheat?',
    });

    await repository.getById(validQuestionId);

    expect(mockQuestionCollection.findOne).toHaveBeenCalledWith(
      {
        _id: new ObjectId(validQuestionId),
      },
      {
        session: undefined,
      },
    );
  });

  it('passes session to findOne', async () => {
    const session = {} as any;

    mockQuestionCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      question: 'What is wheat?',
    });

    await repository.getById(validQuestionId, session);

    expect(mockQuestionCollection.findOne).toHaveBeenCalledWith(
      {
        _id: new ObjectId(validQuestionId),
      },
      {
        session,
      },
    );
  });

  it('throws InternalServerError when questionId is invalid', async () => {
    await expect(repository.getById('invalid-id')).rejects.toThrow(
      InternalServerError,
    );
  });

  it('throws InternalServerError when questionId is missing', async () => {
    await expect(repository.getById('')).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when question is not found', async () => {
    mockQuestionCollection.findOne.mockResolvedValue(null);

    await expect(repository.getById(validQuestionId)).rejects.toThrow(
      InternalServerError,
    );
  });

  it('includes not found message when question does not exist', async () => {
    mockQuestionCollection.findOne.mockResolvedValue(null);

    await expect(repository.getById(validQuestionId)).rejects.toThrow(
      'Failed to find question',
    );
  });

  it('throws InternalServerError when findOne fails', async () => {
    mockQuestionCollection.findOne.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(repository.getById(validQuestionId)).rejects.toThrow(
      InternalServerError,
    );
  });

  it('includes original error message when findOne fails', async () => {
    mockQuestionCollection.findOne.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(repository.getById(validQuestionId)).rejects.toThrow(
      'Database failure',
    );
  });
});
