import 'reflect-metadata';
import {describe, it, expect, beforeEach} from 'vitest';
import {InternalServerError} from 'routing-controllers';

import {QuestionRepository} from '#root/shared/database/providers/mongo/repositories/QuestionRepository.js';

import {mockDatabase} from './mocks/mongo.mock.js';
import {
  mockQuestionCollection,
  resetCollections,
} from './mocks/collections.mock.js';

describe('QuestionRepository.addQuestions', () => {
  let repository: QuestionRepository;

  const validUserId = '507f1f77bcf86cd799439011';
  const validContextId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);
  });

  it('adds questions successfully', async () => {
    mockQuestionCollection.insertMany.mockResolvedValue({
      insertedCount: 2,
    });

    const result = await repository.addQuestions(validUserId, validContextId, [
      'What is wheat?',
      'What is rice?',
    ]);

    expect(result).toEqual({
      insertedCount: 2,
    });
  });

  it('calls insertMany exactly once', async () => {
    mockQuestionCollection.insertMany.mockResolvedValue({
      insertedCount: 1,
    });

    await repository.addQuestions(validUserId, validContextId, [
      'What is wheat?',
    ]);

    expect(mockQuestionCollection.insertMany).toHaveBeenCalledTimes(1);
  });

  it('passes generated question data to insertMany', async () => {
    mockQuestionCollection.insertMany.mockResolvedValue({
      insertedCount: 1,
    });

    await repository.addQuestions(validUserId, validContextId, [
      'What is wheat?',
    ]);

    expect(mockQuestionCollection.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          question: 'What is wheat?',
          status: 'open',
          text: 'Question: What is wheat?',
          totalAnswersCount: 0,
          isAutoAllocate: true,
        }),
      ]),
      {
        session: undefined,
      },
    );
  });

  it('passes session to insertMany', async () => {
    mockQuestionCollection.insertMany.mockResolvedValue({
      insertedCount: 1,
    });

    const session = {} as any;

    await repository.addQuestions(
      validUserId,
      validContextId,
      ['What is wheat?'],
      session,
    );

    expect(mockQuestionCollection.insertMany).toHaveBeenCalledWith(
      expect.any(Array),
      {
        session,
      },
    );
  });

  it('throws InternalServerError when userId is invalid', async () => {
    await expect(
      repository.addQuestions('invalid-user-id', validContextId, [
        'What is wheat?',
      ]),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when userId is missing', async () => {
    await expect(
      repository.addQuestions('', validContextId, ['What is wheat?']),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when contextId is invalid', async () => {
    await expect(
      repository.addQuestions(validUserId, 'invalid-context-id', [
        'What is wheat?',
      ]),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when contextId is missing', async () => {
    await expect(
      repository.addQuestions(validUserId, '', ['What is wheat?']),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when questions array is empty', async () => {
    await expect(
      repository.addQuestions(validUserId, validContextId, []),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when questions is not an array', async () => {
    await expect(
      repository.addQuestions(validUserId, validContextId, null as any),
    ).rejects.toThrow(InternalServerError);
  });

  it('throws InternalServerError when insertMany fails', async () => {
    mockQuestionCollection.insertMany.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      repository.addQuestions(validUserId, validContextId, ['What is wheat?']),
    ).rejects.toThrow(InternalServerError);
  });

  it('includes original error message when insertMany fails', async () => {
    mockQuestionCollection.insertMany.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(
      repository.addQuestions(validUserId, validContextId, ['What is wheat?']),
    ).rejects.toThrow('Database failure');
  });
});
