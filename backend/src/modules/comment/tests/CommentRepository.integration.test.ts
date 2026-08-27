import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';

import {ObjectId} from 'mongodb';

import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {CommentRepository} from '#root/shared/database/providers/mongo/repositories/CommentRespository.js';

dotenv.config({
  path: '.env.test',
});

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;
console.log('DB_URL', DB_URL);

const TS = Date.now();

const QUESTION_ID = new ObjectId().toString();
const ANSWER_ID = new ObjectId().toString();

const USER_ID = new ObjectId().toString();

let db: MongoDatabase;
let repo: CommentRepository;

let comment1Id: string;
let comment2Id: string;

beforeAll(async () => {
  db = new MongoDatabase(DB_URL, DB_NAME);
  await db.init();

  repo = new CommentRepository(db as any);

  const commentsCollection = await db.getCollection('comments');
  const usersCollection = await db.getCollection('users');

  await commentsCollection.deleteMany({
    text: {$regex: '^integration-comment-', $options: 'i'},
  });

  await usersCollection.deleteOne({
    _id: new ObjectId(USER_ID),
  });

  await usersCollection.insertOne({
    _id: new ObjectId(USER_ID),
    firstName: 'Integration',
    lastName: 'User',
    email: `integration-${TS}@test.com`,
  });
}, 30000);

afterAll(async () => {
  const commentsCollection = await db.getCollection('comments');
  const usersCollection = await db.getCollection('users');

  const ids = [comment1Id, comment2Id].filter(Boolean);

  for (const id of ids) {
    await commentsCollection.deleteOne({
      _id: new ObjectId(id),
    });
  }

  await usersCollection.deleteOne({
    _id: new ObjectId(USER_ID),
  });

  await db.disconnect();
}, 30000);

describe('CommentRepository integration', () => {
  it('addComment — inserts a comment', async () => {
    const result = await repo.addComment(
      QUESTION_ID,
      ANSWER_ID,
      `integration-comment-1-${TS}`,
      USER_ID,
    );

    expect(result.insertedId).toBeDefined();

    comment1Id = result.insertedId;
  }, 30000);

  it('addComment — inserted document exists in database', async () => {
    const collection = await db.getCollection('comments');

    const doc = await collection.findOne({
      _id: new ObjectId(comment1Id),
    });

    expect(doc).not.toBeNull();
    expect(doc?.text).toBe(`integration-comment-1-${TS}`);
  }, 30000);

  it('addComment — inserts second comment', async () => {
    const result = await repo.addComment(
      QUESTION_ID,
      ANSWER_ID,
      `integration-comment-2-${TS}`,
      USER_ID,
    );

    expect(result.insertedId).toBeDefined();

    comment2Id = result.insertedId;
  }, 30000);

  it('getComments — returns comments for question and answer', async () => {
    const result = await repo.getComments(QUESTION_ID, ANSWER_ID, 1, 10);

    expect(result.comments.length).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('getComments — returns total count', async () => {
    const result = await repo.getComments(QUESTION_ID, ANSWER_ID, 1, 10);

    expect(result.total).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('getComments — includes user name from lookup', async () => {
    const result = await repo.getComments(QUESTION_ID, ANSWER_ID, 1, 10);

    const comment = result.comments.find(
      c => c.text === `integration-comment-1-${TS}`,
    );

    expect(comment).toBeDefined();
    expect(comment?.userName).toContain('Integration');
  }, 30000);

  it('getComments — returns newest comments first', async () => {
    const result = await repo.getComments(QUESTION_ID, ANSWER_ID, 1, 10);

    expect(result.comments.length).toBeGreaterThanOrEqual(2);

    const dates = result.comments.map(c => new Date(c.createdAt!).getTime());

    const sorted = [...dates].sort((a, b) => b - a);

    expect(dates).toEqual(sorted);
  }, 30000);

  it('getComments — supports pagination', async () => {
    const result = await repo.getComments(QUESTION_ID, ANSWER_ID, 1, 1);

    expect(result.comments).toHaveLength(1);
    expect(result.total).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('getComments — returns empty result for unknown question', async () => {
    const result = await repo.getComments(
      new ObjectId().toString(),
      ANSWER_ID,
      1,
      10,
    );

    expect(result.comments).toEqual([]);
    expect(result.total).toBe(0);
  }, 30000);

  it('getComments — returns empty result for unknown answer', async () => {
    const result = await repo.getComments(
      QUESTION_ID,
      new ObjectId().toString(),
      1,
      10,
    );

    expect(result.comments).toEqual([]);
    expect(result.total).toBe(0);
  }, 30000);
});
