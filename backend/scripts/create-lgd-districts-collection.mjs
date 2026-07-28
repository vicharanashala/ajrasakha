#!/usr/bin/env node

/**
 * ============================================================================
 *  create-lgd-districts-collection.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/create-lgd-districts-collection.mjs          # dry run (default)
 *      node scripts/create-lgd-districts-collection.mjs --apply  # actually write
 *
 *  What it does:
 *    Fetches the LGD (Local Government Directory) districts list from the
 *    same external data.gov.in API used by LocationService.getDistricts()
 *    (backend/src/modules/lgd/services/locationService.ts) and stores it in a
 *    new `lgdDistricts` MongoDB collection, so district lookups can be served
 *    from the database instead of calling the external API on every request.
 *
 *    The districts API only returns results for one state at a time (same as
 *    LocationService, which requires a stateCode), so this script first
 *    fetches the state list and then fetches districts state-by-state.
 *
 *  Collection:
 *    • lgdDistricts — one document per district, upserted on `districtCode`.
 *      Fields stored: districtCode, districtNameEnglish, stateCode,
 *      createdAt, updatedAt.
 *
 *  Safe to re-run: existing districts are upserted (matched on districtCode),
 *  never duplicated. A unique index on `districtCode` is created if missing.
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
const LGD_DISTRICTS_API_URL = process.env.LGD_DISTRICTS_API_URL;
if (!LGD_API_KEY) {
  console.error('❌ LGD_API_KEY is not set.');
  process.exit(1);
}
if (!LGD_STATES_API_URL) {
  console.error('❌ LGD_STATES_API_URL is not set.');
  process.exit(1);
}
if (!LGD_DISTRICTS_API_URL) {
  console.error('❌ LGD_DISTRICTS_API_URL is not set.');
  process.exit(1);
}

const COLLECTION_NAME = 'districts';
// Small pause between per-state requests to be gentle on the external API.
const REQUEST_DELAY_MS = 200;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Shared request helper — mirrors LocationService#makeLGDRequest.
 */
async function makeLgdRequest(apiUrl, filters) {
  const params = {
    'api-key': LGD_API_KEY,
    format: 'json',
    limit: 10000,
    offset: 0,
  };

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      params[`filters[${key}]`] = value;
    }
  }

  const response = await axios.get(apiUrl, { params, timeout: 30000 });

  if (!response?.data?.records) {
    throw new Error('Invalid LGD API response: records missing');
  }

  return response.data.records;
}

/** Mirrors LocationService#fetchStates / #getStates. */
async function fetchStates() {
  const records = await makeLgdRequest(LGD_STATES_API_URL);
  return records.map(record => ({
    stateCode: Number(record.state_code),
    stateNameEnglish: record.state_name_english,
  }));
}

/** Mirrors LocationService#fetchDistricts / #getDistricts. */
async function fetchDistrictsForState(stateCode) {
  const records = await makeLgdRequest(LGD_DISTRICTS_API_URL, { state_code: stateCode });
  return records.map(record => ({
    districtCode: Number(record.district_code),
    districtNameEnglish: record.district_name_english,
    stateCode: Number(record.state_code),
  }));
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
  const states = await fetchStates();
  console.log(`✅ Fetched ${states.length} state(s).\n`);

  console.log('🌐 Fetching districts per state from LGD API...');
  const districts = [];
  const failedStates = [];

  for (const [index, state] of states.entries()) {
    try {
      const stateDistricts = await fetchDistrictsForState(state.stateCode);
      districts.push(...stateDistricts);
      console.log(
        `   [${index + 1}/${states.length}] ${state.stateNameEnglish} (${state.stateCode}): ${stateDistricts.length} district(s)`,
      );
    } catch (error) {
      failedStates.push(state);
      console.warn(
        `   ⚠️  [${index + 1}/${states.length}] ${state.stateNameEnglish} (${state.stateCode}) failed: ${error?.message || error}`,
      );
    }

    if (index < states.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`\n✅ Fetched ${districts.length} district(s) across ${states.length - failedStates.length}/${states.length} state(s).`);
  if (failedStates.length > 0) {
    console.warn(
      `⚠️  Skipped ${failedStates.length} state(s) due to errors: ${failedStates.map(s => s.stateNameEnglish).join(', ')}`,
    );
  }
  console.log('');

  if (districts.length === 0) {
    console.log('Nothing to write — no districts were fetched.');
    process.exit(0);
  }

  if (!APPLY) {
    console.log('Sample document that would be upserted:');
    console.log(JSON.stringify(districts[0], null, 2));
    console.log(
      `\nℹ️  DRY RUN — would upsert ${districts.length} document(s) into "${COLLECTION_NAME}".` +
        '\n   Re-run with --apply to write the changes.',
    );
    process.exit(0);
  }

  const collection = db.collection(COLLECTION_NAME);

  await collection.createIndex({ districtCode: 1 }, { unique: true });

  const now = new Date();
  const bulkOps = districts.map(district => ({
    updateOne: {
      filter: { districtCode: district.districtCode },
      update: {
        $set: { ...district, updatedAt: now },
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
  console.error('❌ Failed to create/populate lgdDistricts collection:', error?.message || error);
  process.exitCode = 1;
} finally {
  await client.close();
}
