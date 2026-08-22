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

describe('QuestionRepository.addQuestion', () => {
  let repository: QuestionRepository;

  beforeEach(() => {
    resetCollections();

    repository = new QuestionRepository(mockDatabase as any);
  });

  it('adds question successfully when _id is provided', async () => {
    const questionId = new ObjectId();

    const question = {
      _id: questionId,
      question: 'What is wheat?',
      status: 'open',
    } as any;

    mockQuestionCollection.insertOne.mockResolvedValue({
      acknowledged: true,
    });

    const result = await repository.addQuestion(question);

    expect(result).toEqual({
      ...question,
      _id: questionId.toString(),
    });
  });

  it('generates _id when not provided', async () => {
    const question = {
      question: 'What is wheat?',
      status: 'open',
    } as any;

    mockQuestionCollection.insertOne.mockResolvedValue({
      acknowledged: true,
    });

    const result = await repository.addQuestion(question);

    expect(result._id).toBeDefined();
    expect(typeof result._id).toBe('string');
  });

  it('calls insertOne exactly once', async () => {
    const question = {
      question: 'What is wheat?',
    } as any;

    mockQuestionCollection.insertOne.mockResolvedValue({
      acknowledged: true,
    });

    await repository.addQuestion(question);

    expect(mockQuestionCollection.insertOne).toHaveBeenCalledTimes(1);
  });

  it('passes question to insertOne', async () => {
    const question = {
      question: 'What is wheat?',
      status: 'open',
    } as any;

    mockQuestionCollection.insertOne.mockResolvedValue({
      acknowledged: true,
    });

    await repository.addQuestion(question);

    expect(mockQuestionCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'What is wheat?',
        status: 'open',
      }),
      {
        session: undefined,
      },
    );
  });

  it('passes session to insertOne', async () => {
    const question = {
      question: 'What is wheat?',
    } as any;

    const session = {} as any;

    mockQuestionCollection.insertOne.mockResolvedValue({
      acknowledged: true,
    });

    await repository.addQuestion(question, session);

    expect(mockQuestionCollection.insertOne).toHaveBeenCalledWith(
      expect.any(Object),
      {
        session,
      },
    );
  });

  it('adds generated ObjectId to question before insert', async () => {
    const question = {
      question: 'What is wheat?',
    } as any;

    mockQuestionCollection.insertOne.mockResolvedValue({
      acknowledged: true,
    });

    await repository.addQuestion(question);

    const insertedQuestion = mockQuestionCollection.insertOne.mock.calls[0][0];

    expect(insertedQuestion._id).toBeInstanceOf(ObjectId);
  });

  it('returns string version of ObjectId', async () => {
    const questionId = new ObjectId();

    const question = {
      _id: questionId,
      question: 'What is wheat?',
    } as any;

    mockQuestionCollection.insertOne.mockResolvedValue({
      acknowledged: true,
    });

    const result = await repository.addQuestion(question);

    expect(result._id).toBe(questionId.toString());
  });

  it('throws InternalServerError when insertOne fails', async () => {
    const question = {
      question: 'What is wheat?',
    } as any;

    mockQuestionCollection.insertOne.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(repository.addQuestion(question)).rejects.toThrow(
      InternalServerError,
    );
  });

  it('includes original error message when insertOne fails', async () => {
    const question = {
      question: 'What is wheat?',
    } as any;

    mockQuestionCollection.insertOne.mockRejectedValue(
      new Error('Database failure'),
    );

    await expect(repository.addQuestion(question)).rejects.toThrow(
      'Database failure',
    );
  });
});
