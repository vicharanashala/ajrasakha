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

describe('QuestionRepository.addDummyQuestion', () => {
  let repository: QuestionRepository;

  const validUserId = '507f1f77bcf86cd799439011';
  const validContextId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);
  });

  it('adds dummy question successfully', async () => {
    const insertedId = new ObjectId();

    mockQuestionCollection.insertOne.mockResolvedValue({
      insertedId,
    });

    const result = await repository.addDummyQuestion(
      validUserId,
      validContextId,
      'What is wheat?',
    );

    expect(result).toMatchObject({
      _id: insertedId,
      question: 'What is wheat?',
      text: 'Question: What is wheat?',
      totalAnswersCount: 0,
      isAutoAllocate: true,
    });
  });

  it('calls insertOne exactly once', async () => {
    mockQuestionCollection.insertOne.mockResolvedValue({
      insertedId: new ObjectId(),
    });

    await repository.addDummyQuestion(
      validUserId,
      validContextId,
      'What is wheat?',
    );

    expect(mockQuestionCollection.insertOne).toHaveBeenCalledTimes(1);
  });

  it('passes generated question to insertOne', async () => {
    mockQuestionCollection.insertOne.mockResolvedValue({
      insertedId: new ObjectId(),
    });

    await repository.addDummyQuestion(
      validUserId,
      validContextId,
      'What is wheat?',
    );

    expect(mockQuestionCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'What is wheat?',
        text: 'Question: What is wheat?',
        totalAnswersCount: 0,
        isAutoAllocate: true,
      }),
      {
        session: undefined,
      },
    );
  });

  it('passes session to insertOne', async () => {
    mockQuestionCollection.insertOne.mockResolvedValue({
      insertedId: new ObjectId(),
    });

    const session = {} as any;

    await repository.addDummyQuestion(
      validUserId,
      validContextId,
      'What is wheat?',
      session,
    );

    expect(mockQuestionCollection.insertOne).toHaveBeenCalledWith(
      expect.any(Object),
      {
        session,
      },
    );
  });

  it('throws InternalServerError when userId is invalid', async () => {
    await expect(
      repository.addDummyQuestion(
        'invalid-id',
        validContextId,
        'What is wheat?',
      ),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when userId is missing', async () => {
    await expect(
      repository.addDummyQuestion('', validContextId, 'What is wheat?'),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when contextId is invalid', async () => {
    await expect(
      repository.addDummyQuestion(validUserId, 'invalid-id', 'What is wheat?'),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when contextId is missing', async () => {
    await expect(
      repository.addDummyQuestion(validUserId, '', 'What is wheat?'),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when question is empty', async () => {
    await expect(
      repository.addDummyQuestion(validUserId, validContextId, ''),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when question is not a string', async () => {
    await expect(
      repository.addDummyQuestion(validUserId, validContextId, null as any),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when insertOne fails', async () => {
    mockQuestionCollection.insertOne.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      repository.addDummyQuestion(
        validUserId,
        validContextId,
        'What is wheat?',
      ),
    ).rejects.toThrow(InternalServerError);
  });

  it('includes original error message when insertOne fails', async () => {
    mockQuestionCollection.insertOne.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      repository.addDummyQuestion(
        validUserId,
        validContextId,
        'What is wheat?',
      ),
    ).rejects.toThrow('Database failure');
  });
});
