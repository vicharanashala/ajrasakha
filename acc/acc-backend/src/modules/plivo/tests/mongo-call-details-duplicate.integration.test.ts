import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CallDetailsRepository } from '#shared/database/providers/mongo/repositories/CallDetailsRepository.js';
import type { CallDetails } from '#shared/database/interfaces/ICallDetailsRepository.js';
import { createInMemoryMongo, waitForIndex, type InMemoryMongo } from './helpers/mongo-memory.js';

function buildCallDetails(callUuid: string, from = '+919900000001'): CallDetails {
  return {
    callUuid,
    from,
    caller: { transcript: '', translation: '', detectedLanguage: '' },
    agent: { transcript: '', translation: '', detectedLanguage: '' },
  };
}

describe('MongoDB duplicate call UUID protection (real in-memory MongoDB)', () => {
  let mongo: InMemoryMongo;
  let callDetailsRepository: CallDetailsRepository;

  beforeAll(async () => {
    mongo = await createInMemoryMongo();
    callDetailsRepository = new CallDetailsRepository(mongo.database);

    const db = await mongo.database.init();
    await waitForIndex(db, 'call_details', 'callUuid_1');
  }, 60000);

  afterAll(async () => {
    await mongo.stop();
  });

  beforeEach(async () => {
    const db = await mongo.database.init();
    await db.collection('call_details').deleteMany({});
    await db.collection('call_queries').deleteMany({});
  });

  it('enforces a unique index on callUuid', async () => {
    const db = await mongo.database.init();
    const indexes = await db.collection('call_details').indexes();
    const callUuidIndex = indexes.find((idx) => idx.name === 'callUuid_1');

    expect(callUuidIndex?.unique).toBe(true);
  });

  it('persists exactly one document for concurrent creates with the same callUuid', async () => {
    const details = buildCallDetails('call-dup-1');

    await Promise.allSettled([
      callDetailsRepository.create(details),
      callDetailsRepository.create(details),
      callDetailsRepository.create(details),
    ]);

    const db = await mongo.database.init();
    const count = await db
      .collection('call_details')
      .countDocuments({ callUuid: 'call-dup-1' });
    expect(count).toBe(1);
  });

  it('does not overwrite the original document on a repeated create', async () => {
    const original = buildCallDetails('call-dup-2', '+919900000001');
    await callDetailsRepository.create(original);

    const db = await mongo.database.init();
    const firstDoc = await db
      .collection('call_details')
      .findOne({ callUuid: 'call-dup-2' });

    await callDetailsRepository.create(buildCallDetails('call-dup-2', '+919900000099'));

    const secondDoc = await db
      .collection('call_details')
      .findOne({ callUuid: 'call-dup-2' });

    expect(secondDoc?.from).toBe(firstDoc?.from);
    expect(secondDoc?._id.toString()).toBe(firstDoc?._id.toString());
  });

  it('allows distinct call UUIDs to persist independently', async () => {
    await callDetailsRepository.create(buildCallDetails('call-a'));
    await callDetailsRepository.create(buildCallDetails('call-b'));

    const db = await mongo.database.init();
    const count = await db.collection('call_details').countDocuments({});
    expect(count).toBe(2);
  });
});
