import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';

dotenv.config({
  path: '.env.test',
});

import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {ContextRepository} from '#root/shared/database/providers/mongo/repositories/ContextRepository.js';

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;
console.log({
  DB_URL,
  DB_NAME,
});

const TS = Date.now();

const TEST_CONTEXT_TEXT = `
This is a context integration test.
Timestamp: ${TS}
`;

let db: MongoDatabase;
let repo: ContextRepository;
let createdContextId: string;

beforeAll(async () => {
  console.log('Creating db');

  db = new MongoDatabase(DB_URL, DB_NAME);

  console.log('Calling init');

  await db.init();

  console.log('Init complete');

  repo = new ContextRepository(db as any);

  console.log('Getting collection');

  const collection = await db.getCollection('contexts');

  console.log('Deleting');

  await collection.deleteMany({
    text: {$regex: `Timestamp: ${TS}`},
  });

  console.log('Done');
}, 30000);

afterAll(async () => {
  if (createdContextId) {
    const collection = await db.getCollection('contexts');

    const {ObjectId} = await import('mongodb');

    await collection.deleteOne({
      _id: new ObjectId(createdContextId),
    });
  }

  await db.disconnect();
}, 30000);

describe('ContextRepository integration', () => {
  it('addContext — inserts a new context', async () => {
    const result = await repo.addContext(TEST_CONTEXT_TEXT);

    expect(result).toBeDefined();
    expect(result.insertedId).toBeDefined();

    createdContextId = result.insertedId;
  }, 30000);

  it('addContext — document exists in database', async () => {
    const collection = await db.getCollection('contexts');

    const doc = await collection.findOne({
      text: TEST_CONTEXT_TEXT,
    });

    expect(doc).not.toBeNull();
  });

  it('getById — returns inserted context', async () => {
    const context = await repo.getById(createdContextId);

    expect(context).not.toBeNull();

    expect(context?._id?.toString()).toBe(createdContextId);

    expect(context?.text).toContain('This is a context integration test');
  }, 30000);

  it('getById — returns null for unknown id', async () => {
    const context = await repo.getById('664f00000000000000000099');

    expect(context).toBeNull();
  }, 30000);

  it('addContext — throws for empty text', async () => {
    await expect(repo.addContext('')).rejects.toThrow();
  }, 30000);

  it('addContext — throws for undefined text', async () => {
    await expect(repo.addContext(undefined as any)).rejects.toThrow();
  }, 30000);

  it('getById — throws for invalid object id', async () => {
    await expect(repo.getById('invalid-id')).rejects.toThrow();
  }, 30000);

  it('getById — throws for empty id', async () => {
    await expect(repo.getById('')).rejects.toThrow();
  }, 30000);
});
