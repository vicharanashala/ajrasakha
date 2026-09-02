import 'reflect-metadata';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {ObjectId} from 'mongodb';
import dotenv from 'dotenv';

import {MongoDatabase} from '../MongoDatabase.js';
import {QuestionSubmissionRepository} from './SubmissionRepository.js';
import {
  IQuestion,
  IQuestionSubmission,
} from '#root/shared/interfaces/models.js';

dotenv.config();

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;

describe('findTimeBoundQuestionsForReallocation', () => {
  let db: MongoDatabase;
  let repository: QuestionSubmissionRepository;

  const testQuestionIds: ObjectId[] = [];

  beforeAll(async () => {
    db = new MongoDatabase(DB_URL, DB_NAME);
    await db.init();

    repository = new QuestionSubmissionRepository(db as any);
  });

  afterAll(async () => {
    const questions = await db.getCollection<IQuestion>('questions');
    const submissions =
      await db.getCollection<IQuestionSubmission>('question_submissions');

    if (testQuestionIds.length > 0) {
      await submissions.deleteMany({
        questionId: {$in: testQuestionIds},
      });

      await questions.deleteMany({
        _id: {$in: testQuestionIds},
      });
    }

    await db.disconnect();
  });

  it('returns an eligible time-bound question allocated more than 45 minutes ago and not opened', async () => {
    const questionId = new ObjectId();
    testQuestionIds.push(questionId);

    const now = new Date();
    const allocatedAt = new Date(now.getTime() - 46 * 60 * 1000);

    const question: IQuestion = {
      _id: questionId,
      question: 'Time-bound reallocation test question',
      userId: new ObjectId(),
      contextId: new ObjectId(),
      status: 'open',
      details: {
        state: 'Kerala',
        district: 'Kollam',
        crop: 'Rice',
        season: 'Kharif',
        domain: ['Agriculture'],
      },
      source: 'AJRASAKHA',
      embedding: [],
      metrics: null,
      text: 'Time-bound reallocation test question',
      totalAnswersCount: 0,
      isAutoAllocate: true,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    };

    const submission: IQuestionSubmission = {
      questionId,
      lastRespondedBy: new ObjectId(),
      history: [],
      queue: [],
      currentExpertAllocatedAt: allocatedAt,
      currentExpertOpenedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const questions = await db.getCollection<IQuestion>('questions');
    const submissions =
      await db.getCollection<IQuestionSubmission>('question_submissions');

    await questions.insertOne(question);
    await submissions.insertOne(submission);

    const results =
      await repository.findTimeBoundQuestionsForReallocation(
        ['AJRASAKHA', 'WHATSAPP'],
      );

    expect(
      results.some(
        result => result.questionId.toString() === questionId.toString(),
      ),
    ).toBe(true);
  });

  it('does not return a time-bound question that has already been opened by the expert', async () => {
    const questionId = new ObjectId();
    testQuestionIds.push(questionId);

    const now = new Date();
    const allocatedAt = new Date(now.getTime() - 46 * 60 * 1000);
    const openedAt = new Date(now.getTime() - 10 * 60 * 1000);

    const question: IQuestion = {
      _id: questionId,
      question: 'Opened question should not be reallocated',
      userId: new ObjectId(),
      contextId: new ObjectId(),
      status: 'open',
      details: {
        state: 'Kerala',
        district: 'Kollam',
        crop: 'Rice',
        season: 'Kharif',
        domain: ['Agriculture'],
      },
      source: 'AJRASAKHA',
      embedding: [],
      metrics: null,
      text: 'Opened question should not be reallocated',
      totalAnswersCount: 0,
      isAutoAllocate: true,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    };

    const submission: IQuestionSubmission = {
      questionId,
      lastRespondedBy: new ObjectId(),
      history: [],
      queue: [],
      currentExpertAllocatedAt: allocatedAt,
      currentExpertOpenedAt: openedAt,
      createdAt: now,
      updatedAt: now,
    };

    const questions = await db.getCollection<IQuestion>('questions');
    const submissions =
      await db.getCollection<IQuestionSubmission>('question_submissions');

    await questions.insertOne(question);
    await submissions.insertOne(submission);

    const results =
      await repository.findTimeBoundQuestionsForReallocation(
        ['AJRASAKHA', 'WHATSAPP'],
      );

    expect(
      results.some(
        result => result.questionId.toString() === questionId.toString(),
      ),
    ).toBe(false);
  });

  it('does not return a time-bound question allocated less than 45 minutes ago', async () => {
    const questionId = new ObjectId();
    testQuestionIds.push(questionId);

    const now = new Date();

    // 44 minutes ago — still within the 45-minute SLA window.
    const allocatedAt = new Date(now.getTime() - 44 * 60 * 1000);

    const question: IQuestion = {
      _id: questionId,
      question: 'Recent allocation should not be reallocated',
      userId: new ObjectId(),
      contextId: new ObjectId(),
      status: 'open',
      details: {
        state: 'Kerala',
        district: 'Kollam',
        crop: 'Rice',
        season: 'Kharif',
        domain: ['Agriculture'],
      },
      source: 'AJRASAKHA',
      embedding: [],
      metrics: null,
      text: 'Recent allocation should not be reallocated',
      totalAnswersCount: 0,
      isAutoAllocate: true,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    };

    const submission: IQuestionSubmission = {
      questionId,
      lastRespondedBy: new ObjectId(),
      history: [],
      queue: [],
      currentExpertAllocatedAt: allocatedAt,
      currentExpertOpenedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const questions = await db.getCollection<IQuestion>('questions');
    const submissions =
      await db.getCollection<IQuestionSubmission>('question_submissions');

    await questions.insertOne(question);
    await submissions.insertOne(submission);

    const results =
      await repository.findTimeBoundQuestionsForReallocation(
        ['AJRASAKHA', 'WHATSAPP'],
      );

    expect(
      results.some(
        result => result.questionId.toString() === questionId.toString(),
      ),
    ).toBe(false);
  });

  it('returns a time-bound question allocated exactly 45 minutes ago', async () => {
    const questionId = new ObjectId();
    testQuestionIds.push(questionId);

    const now = new Date('2026-01-01T12:45:00.000Z');
    const allocatedAt = new Date('2026-01-01T12:00:00.000Z');
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now.getTime());

    try {
      const question: IQuestion = {
        _id: questionId,
        question: 'Boundary allocation should be reallocated',
        userId: new ObjectId(),
        contextId: new ObjectId(),
        status: 'open',
        details: {
          state: 'Kerala',
          district: 'Kollam',
          crop: 'Rice',
          season: 'Kharif',
          domain: ['Agriculture'],
        },
        source: 'AJRASAKHA',
        embedding: [],
        metrics: null,
        text: 'Boundary allocation should be reallocated',
        totalAnswersCount: 0,
        isAutoAllocate: true,
        priority: 'medium',
        createdAt: now,
        updatedAt: now,
      };

      const submission: IQuestionSubmission = {
        questionId,
        lastRespondedBy: new ObjectId(),
        history: [],
        queue: [],
        currentExpertAllocatedAt: allocatedAt,
        currentExpertOpenedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const questions = await db.getCollection<IQuestion>('questions');
      const submissions =
        await db.getCollection<IQuestionSubmission>('question_submissions');

      await questions.insertOne(question);
      await submissions.insertOne(submission);

      const results =
        await repository.findTimeBoundQuestionsForReallocation(
          ['AJRASAKHA', 'WHATSAPP'],
        );

      expect(
        results.some(
          result => result.questionId.toString() === questionId.toString(),
        ),
      ).toBe(true);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('does not return a stale time-bound question that is on hold', async () => {
    const questionId = new ObjectId();
    testQuestionIds.push(questionId);

    const now = new Date();
    const allocatedAt = new Date(now.getTime() - 46 * 60 * 1000);

    const question: IQuestion = {
      _id: questionId,
      question: 'Held question should not be reallocated',
      userId: new ObjectId(),
      contextId: new ObjectId(),
      status: 'open',
      details: {
        state: 'Kerala',
        district: 'Kollam',
        crop: 'Rice',
        season: 'Kharif',
        domain: ['Agriculture'],
      },
      source: 'AJRASAKHA',
      embedding: [],
      metrics: null,
      text: 'Held question should not be reallocated',
      totalAnswersCount: 0,
      isAutoAllocate: true,
      isOnHold: true,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    };

    const submission: IQuestionSubmission = {
      questionId,
      lastRespondedBy: new ObjectId(),
      history: [],
      queue: [],
      currentExpertAllocatedAt: allocatedAt,
      currentExpertOpenedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const questions = await db.getCollection<IQuestion>('questions');
    const submissions =
      await db.getCollection<IQuestionSubmission>('question_submissions');

    await questions.insertOne(question);
    await submissions.insertOne(submission);

    const results =
      await repository.findTimeBoundQuestionsForReallocation(
        ['AJRASAKHA', 'WHATSAPP'],
      );

    expect(
      results.some(
        result => result.questionId.toString() === questionId.toString(),
      ),
    ).toBe(false);
  });

  it('does not return a stale non-time-bound source', async () => {
    const questionId = new ObjectId();
    testQuestionIds.push(questionId);

    const now = new Date();
    const allocatedAt = new Date(now.getTime() - 46 * 60 * 1000);

    const question: IQuestion = {
      _id: questionId,
      question: 'Manual source should not be reallocated here',
      userId: new ObjectId(),
      contextId: new ObjectId(),
      status: 'open',
      details: {
        state: 'Kerala',
        district: 'Kollam',
        crop: 'Rice',
        season: 'Kharif',
        domain: ['Agriculture'],
      },
      source: 'AGRI_EXPERT',
      embedding: [],
      metrics: null,
      text: 'Manual source should not be reallocated here',
      totalAnswersCount: 0,
      isAutoAllocate: true,
      priority: 'medium',
      createdAt: now,
      updatedAt: now,
    };

    const submission: IQuestionSubmission = {
      questionId,
      lastRespondedBy: new ObjectId(),
      history: [],
      queue: [],
      currentExpertAllocatedAt: allocatedAt,
      currentExpertOpenedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const questions = await db.getCollection<IQuestion>('questions');
    const submissions =
      await db.getCollection<IQuestionSubmission>('question_submissions');

    await questions.insertOne(question);
    await submissions.insertOne(submission);

    const results =
      await repository.findTimeBoundQuestionsForReallocation(
        ['AJRASAKHA', 'WHATSAPP'],
      );

    expect(
      results.some(
        result => result.questionId.toString() === questionId.toString(),
      ),
    ).toBe(false);
  });
});
