#!/usr/bin/env node

/**
 * ============================================================================
 *  create-lgd-villages-collection.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/create-lgd-villages-collection.mjs          # dry run (default)
 *      node scripts/create-lgd-villages-collection.mjs --apply  # actually write
 *
 *  What it does:
 *    Fetches the LGD (Local Government Directory) villages list
 *    from the external data.gov.in API and stores it in a new `villages`
 *    MongoDB collection.
 *
 *    The script:
 *      1. Reads all blocks from the existing `blocks` MongoDB collection.
 *      2. Fetches villages block-by-block.
 *      3. Writes villages incrementally after each successful block request.
 *
 *  Collection:
 *    • villages — one document per village, upserted on `villageCode`.
 *
 *  Fields:
 *    • villageCode
 *    • villageNameEnglish
 *    • blockCode
 *    • createdAt
 *    • updatedAt
 *
 *  Safe to re-run:
 *    Existing villages are upserted and never duplicated.
 *
 *  Retry behaviour:
 *    Retries:
 *      • HTTP 429 — Too Many Requests
 *      • HTTP 5xx — Server errors
 *      • Network/timeout errors
 *
 *    Uses exponential backoff with random jitter.
 *    When a 429 occurs, a global cooldown is applied before the next request.
 *
 *  Important:
 *    There is intentionally no --resume option.
 *    If the script is interrupted, run it again from the beginning.
 *    Since writes use upsert, re-running is safe.
 *
 * ============================================================================ */

import 'dotenv/config';
import axios from 'axios';
import { MongoClient } from 'mongodb';


const APPLY = process.argv.includes('--apply');

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';

const LGD_API_KEY = process.env.LGD_API_KEY;
const LGD_VILLAGES_API_URL = process.env.LGD_VILLAGES_API_URL;

const BLOCKS_COLLECTION = 'blocks';
const COLLECTION_NAME = 'villages';

/**
 * Delay between successful API requests.
 */
const REQUEST_DELAY_MS = 2000;

/**
 * Maximum number of attempts for one API request.
 */
const MAX_ATTEMPTS = 6;

/**
 * Initial retry delay.
 */
const INITIAL_BACKOFF_MS = 10_000;

/**
 * Maximum global cooldown after a 429.
 */
const MAX_GLOBAL_COOLDOWN_MS = 120_000;

/**
 * Random jitter added to retry delays.
 */
const MAX_JITTER_MS = 2000;

/* -------------------------------------------------------------------------- */
/* Environment validation                                                     */
/* -------------------------------------------------------------------------- */

if (!DB_URL) {
  console.error('❌ DB_URL is not set.');
  process.exit(1);
}

if (!LGD_API_KEY) {
  console.error('❌ LGD_API_KEY is not set.');
  process.exit(1);
}

if (!LGD_VILLAGES_API_URL) {
  console.error('❌ LGD_VILLAGES_API_URL is not set.');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getRandomJitter = () => Math.floor(Math.random() * MAX_JITTER_MS);

let globalCooldownMs = 0;

async function waitBeforeRequest() {
  if (globalCooldownMs > 0) {
    console.log(
      `      ⏳ Global API cooldown: waiting ${Math.round(
        globalCooldownMs / 1000,
      )}s...`,
    );

    await sleep(globalCooldownMs);
  }
}

function increaseGlobalCooldown() {
  if (globalCooldownMs === 0) {
    globalCooldownMs = 10_000;
  } else {
    globalCooldownMs = Math.min(
      globalCooldownMs * 2,
      MAX_GLOBAL_COOLDOWN_MS,
    );
  }
}

function reduceGlobalCooldown() {
  if (globalCooldownMs > 0) {
    globalCooldownMs = Math.floor(globalCooldownMs / 2);

    if (globalCooldownMs < 1000) {
      globalCooldownMs = 0;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* LGD API request                                                            */
/* -------------------------------------------------------------------------- */

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

  let backoffMs = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await waitBeforeRequest();

    try {
      const response = await axios.get(apiUrl, {
        params,
        timeout: 30_000,
      });

      if (!response?.data?.records) {
        throw new Error('Invalid LGD API response: records missing');
      }

      reduceGlobalCooldown();

      return response.data.records;
    } catch (error) {
      const status = error?.response?.status;
      const isNetworkError = !error.response;
      const isRateLimited = status === 429;
      const isServerError = status >= 500 && status <= 599;

      const shouldRetry = isNetworkError || isRateLimited || isServerError;
      const isLastAttempt = attempt === MAX_ATTEMPTS;

      if (!shouldRetry || isLastAttempt) {
        throw error;
      }

      if (isRateLimited) {
        increaseGlobalCooldown();
        console.warn(`      ⚠️ API rate limit reached (429).`);
        console.warn(
          `      ⏳ Increasing global cooldown to ${Math.round(
            globalCooldownMs / 1000,
          )}s.`,
        );
      }

      const jitterMs = getRandomJitter();
      const retryDelayMs = backoffMs + jitterMs;

      console.warn(`      ⚠️ Attempt ${attempt}/${MAX_ATTEMPTS} failed.`);
      console.warn(
        `      🔁 Retrying in ${Math.round(retryDelayMs / 1000)}s...`,
      );
      console.warn(`      Reason: ${error?.message || error}`);

      await sleep(retryDelayMs);

      backoffMs *= 2;
    }
  }

  throw new Error('Unexpected retry loop termination.');
}

/* -------------------------------------------------------------------------- */
/* Fetch villages                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors LocationService#fetchVillages / #getVillages.
 */
async function fetchVillagesForBlock(blockCode) {
  const records = await makeLgdRequest(LGD_VILLAGES_API_URL, {
    subdistrictCode: blockCode,
  });

  return records.map(record => ({
    villageCode: Number(record.villageCode),
    villageNameEnglish: record.villageNameEnglish,
    blockCode: Number(blockCode),
  }));
}

/* -------------------------------------------------------------------------- */
/* MongoDB                                                                    */
/* -------------------------------------------------------------------------- */

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);
const blocksCollection = db.collection(BLOCKS_COLLECTION);
const villagesCollection = db.collection(COLLECTION_NAME);

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

try {
  console.log(
    `\n🗄️  Database  : ${DB_NAME}` +
      `\n📦 Collection: ${COLLECTION_NAME}` +
      `\n🔧 Mode      : ${
        APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes — pass --apply)'
      }\n`,
  );

  if (APPLY) {
    console.log('🔧 Ensuring unique index on villageCode...');
    await villagesCollection.createIndex(
      { villageCode: 1 },
      { unique: true },
    );
    console.log('✅ Unique index ready.\n');
  }

  /* ---------------------------------------------------------------------- */
  /* Fetch blocks from MongoDB                                              */
  /* ---------------------------------------------------------------------- */

  console.log('🌐 Fetching blocks from MongoDB...');
  
  const allBlocks = await blocksCollection.find({}).sort({ blockCode: 1 }).toArray();

  console.log(`✅ Found ${allBlocks.length} block(s).\n`);

  if (allBlocks.length === 0) {
    console.log('Nothing to process — no blocks were found in MongoDB.');
    process.exit(0);
  }

  /* ---------------------------------------------------------------------- */
  /* Fetch villages and write incrementally                                 */
  /* ---------------------------------------------------------------------- */

  console.log('🌐 Fetching villages per block from LGD API and saving incrementally...\n');

  let totalVillagesFetched = 0;
  let totalVillagesInserted = 0;
  let totalVillagesUpdated = 0;
  let totalBlocksProcessed = 0;

  const failedBlocks = [];
  let dryRunSampleShown = false;

  for (const [index, block] of allBlocks.entries()) {
    try {
      const blockVillages = await fetchVillagesForBlock(block.blockCode);

      totalBlocksProcessed++;
      totalVillagesFetched += blockVillages.length;

      console.log(
        `   [${index + 1}/${allBlocks.length}] ${block.blockNameEnglish} (${block.blockCode}): ${blockVillages.length} village(s)`,
      );

      if (blockVillages.length > 0 && !dryRunSampleShown && !APPLY) {
        console.log('\nSample document that would be upserted:');
        console.log(JSON.stringify(blockVillages[0], null, 2));
        dryRunSampleShown = true;
      }

      if (APPLY && blockVillages.length > 0) {
        const now = new Date();

        const bulkOps = blockVillages.map(village => ({
          updateOne: {
            filter: { villageCode: village.villageCode },
            update: {
              $set: { ...village, updatedAt: now },
              $setOnInsert: { createdAt: now },
            },
            upsert: true,
          },
        }));

        const result = await villagesCollection.bulkWrite(bulkOps, {
          ordered: false,
        });

        totalVillagesInserted += result.upsertedCount;
        totalVillagesUpdated += result.modifiedCount;
      }
    } catch (error) {
      failedBlocks.push(block);
      console.warn(
        `   ⚠️ [${index + 1}/${allBlocks.length}] ${block.blockNameEnglish} (${block.blockCode}) failed after ${MAX_ATTEMPTS} attempts: ${error?.message || error}`,
      );
    }

    if (index < allBlocks.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Summary                                                                */
  /* ---------------------------------------------------------------------- */

  console.log('\n✅ Finished processing all blocks.');
  console.log('\n📊 Summary:');
  console.log(`   - Total blocks: ${allBlocks.length}`);
  console.log(`   - Blocks processed successfully: ${totalBlocksProcessed}`);
  console.log(`   - Total villages fetched: ${totalVillagesFetched}`);

  if (APPLY) {
    console.log(`   - Villages inserted: ${totalVillagesInserted}`);
    console.log(`   - Villages updated: ${totalVillagesUpdated}`);
  }

  if (failedBlocks.length > 0) {
    console.warn(`\n⚠️ Failed blocks: ${failedBlocks.length}`);
    for (const block of failedBlocks) {
      console.warn(`   - ${block.blockNameEnglish} (${block.blockCode})`);
    }
  }

  if (!APPLY) {
    console.log(
      `\nℹ️ DRY RUN — would upsert ${totalVillagesFetched} document(s) into "${COLLECTION_NAME}".`,
    );
    console.log('   Re-run with --apply to write the changes.');
  }

  console.log('\n🎉 Done.');
} catch (error) {
  console.error(
    `❌ Failed to create/populate ${COLLECTION_NAME} collection:`,
    error?.message || error,
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
