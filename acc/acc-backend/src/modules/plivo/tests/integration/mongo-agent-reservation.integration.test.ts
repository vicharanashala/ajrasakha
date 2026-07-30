import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserRepository } from '#shared/database/providers/mongo/repositories/UserRepository.js';
import { createInMemoryMongo, type InMemoryMongo } from '../helpers/mongo-memory.js';

describe('MongoDB atomic agent reservation (real in-memory MongoDB)', () => {
  let mongo: InMemoryMongo;
  let userRepository: UserRepository;

  beforeAll(async () => {
    mongo = await createInMemoryMongo();
    userRepository = new UserRepository(mongo.database);
  }, 60000);

  afterAll(async () => {
    await mongo.stop();
  });

  beforeEach(async () => {
    const db = await mongo.database.init();
    await db.collection('users').deleteMany({});
  });

  async function seedAgent(agentNumber: string, overrides: Record<string, unknown> = {}) {
    const db = await mongo.database.init();
    await db.collection('users').insertOne({
      firebaseUID: `fb-${agentNumber}`,
      email: `${agentNumber}@example.test`,
      firstName: agentNumber,
      role: 'call_agent',
      isCallAgentActive: true,
      isBusy: false,
      agent: agentNumber,
      currentCallUuid: null,
      ...overrides,
    });
  }

  it('never assigns the same agent to two concurrent calls', async () => {
    await seedAgent('agent_1');
    await seedAgent('agent_2');

    const [first, second] = await Promise.all([
      userRepository.findAndMarkAvailableAgent('call-a'),
      userRepository.findAndMarkAvailableAgent('call-b'),
    ]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!._id).not.toBe(second!._id);
    expect([first!.currentCallUuid, second!.currentCallUuid].sort()).toEqual([
      'call-a',
      'call-b',
    ]);
  });

  it('reserves the lowest-numbered available agent first', async () => {
    await seedAgent('agent_3');
    await seedAgent('agent_1');
    await seedAgent('agent_2');

    const reserved = await userRepository.findAndMarkAvailableAgent('call-x');

    expect(reserved?.agent).toBe('agent_1');
  });

  it('returns null when no agent is free', async () => {
    await seedAgent('agent_1', { isBusy: true, currentCallUuid: 'already-busy' });

    const reserved = await userRepository.findAndMarkAvailableAgent('call-y');

    expect(reserved).toBeNull();
  });

  it('ignores agents that are inactive or unassigned', async () => {
    await seedAgent('agent_1', { isCallAgentActive: false });
    await seedAgent('not_available', { agent: 'not_available' });

    const reserved = await userRepository.findAndMarkAvailableAgent('call-z');

    expect(reserved).toBeNull();
  });

  it('does not double-book a single agent under a burst of concurrent calls', async () => {
    await seedAgent('agent_1');

    const callUuids = Array.from({ length: 10 }, (_, i) => `burst-${i}`);
    const results = await Promise.all(
      callUuids.map((uuid) => userRepository.findAndMarkAvailableAgent(uuid)),
    );

    const successes = results.filter((result) => result !== null);
    expect(successes).toHaveLength(1);

    const db = await mongo.database.init();
    const busyAgents = await db
      .collection('users')
      .find({ agent: 'agent_1', isBusy: true })
      .toArray();
    expect(busyAgents).toHaveLength(1);
  });

  it('reserves a distinct agent per call across a burst with enough capacity', async () => {
    await seedAgent('agent_1');
    await seedAgent('agent_2');
    await seedAgent('agent_3');

    const callUuids = ['call-1', 'call-2', 'call-3'];
    const results = await Promise.all(
      callUuids.map((uuid) => userRepository.findAndMarkAvailableAgent(uuid)),
    );

    expect(results.every((result) => result !== null)).toBe(true);
    const assignedIds = results.map((result) => result!._id);
    expect(new Set(assignedIds).size).toBe(3);
  });
});
