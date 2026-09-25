// =============================================================================
// testing/seed/lib/db.mjs
// -----------------------------------------------------------------------------
// Mongo connection helper for seed/clear scripts.
//
// Mirrors the patterns in ajrasakha/backend/scripts/recalculate-reputation-scores.mjs:
//   • reads backend/.env via dotenv
//   • re-uses the mongodb package from backend/node_modules
//   • exposes both client and db so callers can use collections directly
// =============================================================================

import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// resolve the backend .env from this file: testing/seed/lib → ../../ajrasakha/backend/.env
export const ENV_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'ajrasakha',
  'backend',
  '.env',
);

export function loadEnv() {
  config({ path: ENV_PATH });
  if (!process.env.DB_URL || !process.env.DB_NAME) {
    throw new Error(
      `DB_URL / DB_NAME missing — populate ${ENV_PATH} first (copy from .env.example and set DB_NAME=agriai_loadtest).`,
    );
  }
  // hard safety check — never write to a non-loadtest DB
  if (process.env.DB_NAME !== 'agriai_loadtest') {
    throw new Error(
      `refusing to run: DB_NAME=${process.env.DB_NAME} (must be agriai_loadtest). ` +
      `Set DB_NAME in backend/.env to the load-test DB.`,
    );
  }
}

export async function connect() {
  loadEnv();
  const client = new MongoClient(process.env.DB_URL, {
    // tuned for the seed workload — bulk inserts in 1k batches
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  return { client, db: client.db(process.env.DB_NAME) };
}

export async function close(client) {
  if (client) await client.close();
}

// Mirror of docker/mongo-init/01-loadtest-indexes.js — keeps local mongod and
// the docker testbed in lock-step. Idempotent: createIndex no-ops on identical
// keys; differing keys throw.
export async function ensureIndexes(db) {
  const tasks = [
    ['users', { email: 1 }, { unique: true }],
    ['users', { firebaseUID: 1 }, { unique: true }],
    ['users', { role: 1, reputation_score: 1 }, {}],
    ['users', { 'preference.state': 1, 'preference.crop': 1 }, {}],
    ['questions', { status: 1, autoAllocateModerator: 1 }, {}],
    ['questions', { 'details.state': 1, 'details.normalised_crop': 1 }, {}],
    ['questions', { createdAt: 1 }, {}],
    ['questions', { moderatorId: 1, status: 1 }, {}],
    ['questions', { userId: 1, status: 1 }, {}],
    ['question_submissions', { questionId: 1 }, {}],
    ['question_submissions', { queue: 1 }, {}],
    ['question_submissions', { 'history.updatedBy': 1, 'history.status': 1 }, {}],
    ['reroutes', { questionId: 1 }, {}],
    ['reroutes', { 'reroutes.reroutedTo': 1, 'reroutes.status': 1 }, {}],
  ];
  for (const [col, key, opts] of tasks) {
    await db.collection(col).createIndex(key, opts);
  }
}
