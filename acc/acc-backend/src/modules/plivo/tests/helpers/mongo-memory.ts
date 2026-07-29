import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Db } from 'mongodb';
import { MongoDatabase } from '#shared/database/providers/mongo/MongoDatabase.js';

export interface InMemoryMongo {
  database: MongoDatabase;
  stop: () => Promise<void>;
}

export async function createInMemoryMongo(
  dbName = 'acc_integration_test',
): Promise<InMemoryMongo> {
  const server = await MongoMemoryServer.create();
  const database = new MongoDatabase(server.getUri(), dbName, 'acc-integration-test');

  return {
    database,
    stop: async () => {
      await database.disconnect();
      await server.stop();
    },
  };
}

// MongoDatabase.connect() fires createIndex() without awaiting it, so the
// unique index is not guaranteed to exist the instant init() resolves.
// Poll for it in test setup rather than racing production code.
export async function waitForIndex(
  db: Db,
  collectionName: string,
  indexName: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const indexes = await db.collection(collectionName).indexes();
      if (indexes.some((idx) => idx.name === indexName)) {
        return;
      }
    } catch {
      // Collection doesn't exist yet - createIndex() in MongoDatabase.connect()
      // is fired without being awaited, so it may not have run yet. Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Index ${indexName} on ${collectionName} did not appear within ${timeoutMs}ms`);
}
