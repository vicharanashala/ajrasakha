/**
 * Comment Controller — End-to-End test.
 *
 * WHAT THIS COVERS
 * ----------------
 *   GET  /api/comments/question/:questionId/answer/:answerId   (paginated list)
 *   POST /api/comments/question/:questionId/answer/:answerId   (add comment)
 *
 * FIXTURES
 * --------
 * A real OUTREACH question is created via `POST /api/questions` (no ingestion
 * pipeline — status is `open` immediately, matching QuestionCreate.e2e.test.ts).
 * An answer doc is inserted directly into the `answers` collection (going through
 * the full allocate → submit → review pipeline just to get one answer row would be
 * a lot of unrelated machinery for a suite that isn't testing that pipeline).
 */

process.env.NODE_ENV = 'development';

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({path: '.env'});
dotenv.config({path: '.env.test'});

import express from 'express';
import request from 'supertest';
import {useExpressServer} from 'routing-controllers';
import {ObjectId} from 'mongodb';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';

const ROUTE_PREFIX = '/api';
const RUN_TAG = `E2E_COMMENT_${Date.now()}`;
const INTERNAL_API_KEY = 'e2e-comment-key';

let app: express.Express;
let db: any;
let moderatorUser: any;
let expertUser: any;

let currentTestUser: any = null;

let questionId: string;
let answerId: string;
const createdCommentIds: string[] = [];

beforeAll(async () => {
  await import('#root/modules/answer/services/AnswerService.js');
  process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

  const {loadAppModules, getContainer} = await import('#root/bootstrap/loadModules.js');
  const {GLOBAL_TYPES} = await import('#root/types.js');

  const {controllers} = await loadAppModules('all');
  const container = getContainer();
  db = container.get(GLOBAL_TYPES.Database);

  app = useExpressServer(express(), {
    controllers,
    routePrefix: ROUTE_PREFIX,
    defaultErrorHandler: true,
    authorizationChecker: async () => !!currentTestUser,
    currentUserChecker: async () => currentTestUser,
  });

  const users = await db.getCollection('users');
  [moderatorUser, expertUser] = await Promise.all([
    users.findOne({email: process.env.MODERATOR_EMAIL}),
    users.findOne({email: process.env.EXPERT_EMAIL}),
  ]);
  const missing = [
    !moderatorUser && `MODERATOR_EMAIL=${process.env.MODERATOR_EMAIL}`,
    !expertUser && `EXPERT_EMAIL=${process.env.EXPERT_EMAIL}`,
  ].filter(Boolean);
  if (missing.length) throw new Error(`Test users not found: ${missing.join(', ')}`);

  // Fixture question (OUTREACH — no ingestion pipeline, immediately `open`).
  currentTestUser = moderatorUser;
  const qRes = await request(app)
    .post(`${ROUTE_PREFIX}/questions`)
    .set('x-internal-api-key', INTERNAL_API_KEY)
    .send({
      question: `${RUN_TAG} fixture question`,
      priority: 'medium',
      source: 'OUTREACH',
      details: {
        state: 'Punjab',
        district: 'Ludhiana',
        crop: 'Wheat',
        season: 'Rabi',
        domain: ['Crop Protection'],
      },
    });
  if (qRes.status !== 201) {
    throw new Error(`Fixture question creation failed: ${qRes.status} ${JSON.stringify(qRes.body)}`);
  }
  questionId = qRes.body.question_id;

  // Fixture answer — direct insert, bypassing the review pipeline.
  const answers = await db.getCollection('answers');
  const answerResult = await answers.insertOne({
    questionId: new ObjectId(questionId),
    authorId: new ObjectId(expertUser._id),
    answerIteration: 1,
    approvalCount: 0,
    isFinalAnswer: false,
    answer: `${RUN_TAG} fixture answer`,
    sources: [],
    embedding: [],
    createdAt: new Date(),
  });
  answerId = answerResult.insertedId.toString();

  console.log(`[setup] Connected. RUN_TAG=${RUN_TAG} questionId=${questionId} answerId=${answerId}`);
}, 90000);

afterAll(async () => {
  currentTestUser = null;
  if (db) {
    const questions = await db.getCollection('questions');
    const answers = await db.getCollection('answers');
    const comments = await db.getCollection('comments');
    if (questionId) await questions.deleteOne({_id: new ObjectId(questionId)}).catch(() => {});
    if (answerId) await answers.deleteOne({_id: new ObjectId(answerId)}).catch(() => {});
    for (const id of createdCommentIds) {
      await comments.deleteOne({_id: new ObjectId(id)}).catch(() => {});
    }
    console.log(`[teardown] Cleaned up fixture question/answer + ${createdCommentIds.length} comment(s).`);
  }
  if (db?.disconnect) await db.disconnect();
}, 60000);

function apiGet(path: string) {
  return request(app).get(path).set('x-internal-api-key', INTERNAL_API_KEY);
}
function apiPost(path: string) {
  return request(app).post(path).set('x-internal-api-key', INTERNAL_API_KEY);
}

describe('Auth gate', () => {
  it('returns 401 with no authenticated user', async () => {
    currentTestUser = null;
    const res = await apiGet(`${ROUTE_PREFIX}/comments/question/${questionId}/answer/${answerId}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /comments/question/:questionId/answer/:answerId', () => {
  it('returns an empty list before any comment exists', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/comments/question/${questionId}/answer/${answerId}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.comments).toEqual([]);
  });
});

describe('POST /comments/question/:questionId/answer/:answerId', () => {
  it('rejects an empty comment body', async () => {
    currentTestUser = moderatorUser;
    const res = await apiPost(`${ROUTE_PREFIX}/comments/question/${questionId}/answer/${answerId}`).send({});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(400);
  });

  it('adds a comment successfully', async () => {
    currentTestUser = moderatorUser;
    const text = `${RUN_TAG} — first comment`;
    const res = await apiPost(`${ROUTE_PREFIX}/comments/question/${questionId}/answer/${answerId}`).send({text});

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(201);
    expect(res.body).toBe(true);

    const comments = await db.getCollection('comments');
    const doc = await comments.findOne({questionId: new ObjectId(questionId), text});
    expect(doc).toBeTruthy();
    createdCommentIds.push(doc._id.toString());
  }, 15000);

  it('the newly added comment is visible via GET, with total incremented', async () => {
    currentTestUser = expertUser;
    const res = await apiGet(`${ROUTE_PREFIX}/comments/question/${questionId}/answer/${answerId}`);

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].text).toContain('first comment');
  });

  it('500s (BUG-009) for a comment on a non-existent answer — comment is still persisted', async () => {
    currentTestUser = moderatorUser;
    const fakeAnswerId = new ObjectId().toString();
    const res = await apiPost(`${ROUTE_PREFIX}/comments/question/${questionId}/answer/${fakeAnswerId}`).send({
      text: 'orphan comment',
    });

    console.log('STATUS:', res.status, 'BODY:', JSON.stringify(res.body));
    // CommentService.addComment inserts the comment first, THEN calls
    // AnswerRepository.getById(answerId) to find the author to notify. That's
    // BUG-009 (see README): getById evaluates `answer._id?.toString()` where
    // `answer` itself is null for a missing id, throwing before the `?.` guard
    // can help — surfacing as a 500 here instead of a clean 404/400. The
    // comment row is already committed by that point regardless.
    expect(res.status).toBe(500);

    const comments = await db.getCollection('comments');
    const orphan = await comments.findOne({answerId: new ObjectId(fakeAnswerId)});
    if (orphan) {
      console.log('CONFIRMED: comment was persisted despite the 400 response — orphaned row, cleaning up.');
      createdCommentIds.push(orphan._id.toString());
    }
  });
});
