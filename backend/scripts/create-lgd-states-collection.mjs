#!/usr/bin/env node

/**
 * ============================================================================
 *  create-lgd-states-collection.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/create-lgd-states-collection.mjs          # dry run (default)
 *      node scripts/create-lgd-states-collection.mjs --apply  # actually write
 *
 *  What it does:
 *    Fetches the LGD (Local Government Directory) states list from the same
 *    external data.gov.in API used by LocationService.getStates()
 *    (backend/src/modules/lgd/services/locationService.ts) and stores it in a
 *    new `lgdStates` MongoDB collection, so state lookups can be served from
 *    the database instead of calling the external API on every request.
 *
 *  Collection:
 *    • lgdStates — one document per state, upserted on `stateCode`.
 *
 *  Safe to re-run: existing states are upserted (matched on stateCode), never
 *  duplicated. A unique index on `stateCode` is created if missing.
 *
 *  Reads DB_URL / DB_NAME and the LGD_* env vars from backend/.env.
 * ============================================================================
 */
import 'dotenv/config';
import axios from 'axios';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

const LGD_API_KEY = process.env.LGD_API_KEY;
const LGD_STATES_API_URL = process.env.LGD_STATES_API_URL;
if (!LGD_API_KEY) {
  console.error('❌ LGD_API_KEY is not set.');
  process.exit(1);
}
if (!LGD_STATES_API_URL) {
  console.error('❌ LGD_STATES_API_URL is not set.');
  process.exit(1);
}

const COLLECTION_NAME = 'states';

/**
 * Fetches the raw state records from the LGD API.
 * Mirrors LocationService#fetchStates / #makeLGDRequest.
 */
async function fetchStatesFromApi() {
  const params = {
    'api-key': LGD_API_KEY,
    format: 'json',
    limit: 10000,
    offset: 0,
  };

  const response = await axios.get(LGD_STATES_API_URL, {
    params,
    timeout: 30000,
  });

  if (!response?.data?.records) {
    throw new Error('Invalid LGD API response: records missing');
  }

  return response.data.records;
}

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  console.log(
    `\n🗄️  Database  : ${DB_NAME}` +
      `\n📦 Collection: ${COLLECTION_NAME}` +
      `\n🔧 Mode      : ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes — pass --apply)'}\n`,
  );

  console.log('🌐 Fetching states from LGD API...');
  const records = await fetchStatesFromApi();

  const states = records.map(record => ({
    stateCode: Number(record.state_code),
    stateNameEnglish: record.state_name_english,
  }));

  console.log(`✅ Fetched ${states.length} state(s) from the LGD API.\n`);

  if (states.length === 0) {
    console.log('Nothing to write — the LGD API returned no states.');
    process.exit(0);
  }

  if (!APPLY) {
    console.log('Sample document that would be upserted:');
    console.log(JSON.stringify(states[0], null, 2));
    console.log(
      `\nℹ️  DRY RUN — would upsert ${states.length} document(s) into "${COLLECTION_NAME}".` +
        '\n   Re-run with --apply to write the changes.',
    );
    process.exit(0);
  }

  const collection = db.collection(COLLECTION_NAME);

  await collection.createIndex({ stateCode: 1 }, { unique: true });

  const now = new Date();
  const bulkOps = states.map(state => ({
    updateOne: {
      filter: { stateCode: state.stateCode },
      update: {
        $set: { ...state, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      upsert: true,
    },
  }));

  const result = await collection.bulkWrite(bulkOps);
  console.log(
    `✅ Upserted into "${COLLECTION_NAME}": ${result.upsertedCount} inserted, ${result.modifiedCount} updated ` +
      `(${result.matchedCount} matched).`,
  );

  console.log('\n🎉 Done.');
} catch (error) {
  console.error('❌ Failed to create/populate lgdStates collection:', error?.message || error);
  process.exitCode = 1;
} finally {
  await client.close();
}
