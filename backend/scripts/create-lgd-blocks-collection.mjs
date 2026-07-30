#!/usr/bin/env node

/**
 * ============================================================================
 *  create-lgd-blocks-collection.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/create-lgd-blocks-collection.mjs
 *          # dry run (default)
 *
 *      node scripts/create-lgd-blocks-collection.mjs --apply
 *          # actually write
 *
 *  What it does:
 *    Fetches the LGD (Local Government Directory) blocks (subdistricts) list
 *    from the external data.gov.in API and stores it in a new `blocks`
 *    MongoDB collection.
 *
 *    The script:
 *      1. Fetches all states.
 *      2. Fetches all districts state-by-state.
 *      3. Fetches blocks district-by-district.
 *      4. Writes blocks incrementally after each successful district request.
 *
 *  Collection:
 *    • blocks — one document per block, upserted on `blockCode`.
 *
 *  Fields:
 *    • blockCode
 *    • blockNameEnglish
 *    • districtCode
 *    • createdAt
 *    • updatedAt
 *
 *  Safe to re-run:
 *    Existing blocks are upserted and never duplicated.
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

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const APPLY = process.argv.includes('--apply');

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';

const LGD_API_KEY = process.env.LGD_API_KEY;
const LGD_STATES_API_URL = process.env.LGD_STATES_API_URL;
const LGD_DISTRICTS_API_URL = process.env.LGD_DISTRICTS_API_URL;
const LGD_SUBDISTRICTS_API_URL = process.env.LGD_SUBDISTRICTS_API_URL;

const COLLECTION_NAME = 'blocks';

/**
 * Delay between successful API requests.
 *
 * This is intentionally longer than the original 200ms to reduce
 * the possibility of hitting the LGD API rate limit.
 */
const REQUEST_DELAY_MS = 2000;

/**
 * Maximum number of attempts for one API request.
 *
 * Example:
 *
 * Attempt 1 → initial request
 * Attempt 2 → retry
 * Attempt 3 → retry
 * ...
 */
const MAX_ATTEMPTS = 6;

/**
 * Initial retry delay.
 *
 * Exponential backoff:
 *
 * 10s
 * 20s
 * 40s
 * 80s
 * 160s
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

if (!LGD_STATES_API_URL) {
  console.error('❌ LGD_STATES_API_URL is not set.');
  process.exit(1);
}

if (!LGD_DISTRICTS_API_URL) {
  console.error('❌ LGD_DISTRICTS_API_URL is not set.');
  process.exit(1);
}

if (!LGD_SUBDISTRICTS_API_URL) {
  console.error('❌ LGD_SUBDISTRICTS_API_URL is not set.');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const getRandomJitter = () =>
  Math.floor(Math.random() * MAX_JITTER_MS);

/**
 * Global cooldown.
 *
 * This increases when the API returns 429 and gradually resets after
 * successful requests.
 */
let globalCooldownMs = 0;

/**
 * Wait before making the next request.
 */
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

/**
 * Increase global cooldown after a rate-limit response.
 */
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

/**
 * Gradually reduce the cooldown after successful requests.
 */
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

/**
 * Shared LGD API request helper.
 *
 * Retries:
 *   • 429
 *   • 5xx
 *   • network errors
 *   • timeout errors
 *
 * Uses exponential backoff with random jitter.
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

  let backoffMs = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await waitBeforeRequest();

    try {
      const response = await axios.get(apiUrl, {
        params,
        timeout: 30_000,
      });

      if (!response?.data?.records) {
        throw new Error(
          'Invalid LGD API response: records missing',
        );
      }

      /**
       * Successful request.
       */
      reduceGlobalCooldown();

      return response.data.records;
    } catch (error) {
      const status = error?.response?.status;

      const isNetworkError = !error.response;

      const isRateLimited = status === 429;

      const isServerError =
        status >= 500 && status <= 599;

      const shouldRetry =
        isNetworkError ||
        isRateLimited ||
        isServerError;

      const isLastAttempt =
        attempt === MAX_ATTEMPTS;

      if (!shouldRetry || isLastAttempt) {
        throw error;
      }

      if (isRateLimited) {
        increaseGlobalCooldown();

        console.warn(
          `      ⚠️ API rate limit reached (429).`,
        );

        console.warn(
          `      ⏳ Increasing global cooldown to ${Math.round(
            globalCooldownMs / 1000,
          )}s.`,
        );
      }

      const jitterMs = getRandomJitter();

      const retryDelayMs =
        backoffMs + jitterMs;

      console.warn(
        `      ⚠️ Attempt ${attempt}/${MAX_ATTEMPTS} failed.`,
      );

      console.warn(
        `      🔁 Retrying in ${Math.round(
          retryDelayMs / 1000,
        )}s...`,
      );

      console.warn(
        `      Reason: ${error?.message || error}`,
      );

      await sleep(retryDelayMs);

      backoffMs *= 2;
    }
  }

  throw new Error('Unexpected retry loop termination.');
}

/* -------------------------------------------------------------------------- */
/* Fetch states                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors LocationService#fetchStates / #getStates.
 */
async function fetchStates() {
  const records = await makeLgdRequest(
    LGD_STATES_API_URL,
  );

  return records.map(record => ({
    stateCode: Number(record.state_code),
    stateNameEnglish: record.state_name_english,
  }));
}

/* -------------------------------------------------------------------------- */
/* Fetch districts                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors LocationService#fetchDistricts / #getDistricts.
 */
async function fetchDistrictsForState(stateCode) {
  const records = await makeLgdRequest(
    LGD_DISTRICTS_API_URL,
    {
      state_code: stateCode,
    },
  );

  return records.map(record => ({
    districtCode: Number(record.district_code),
    districtNameEnglish:
      record.district_name_english,
    stateCode: Number(record.state_code),
  }));
}

/* -------------------------------------------------------------------------- */
/* Fetch blocks                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors LocationService#fetchSubDistricts / #getBlocks.
 */
async function fetchBlocksForDistrict(districtCode) {
  const records = await makeLgdRequest(
    LGD_SUBDISTRICTS_API_URL,
    {
      district_code: districtCode,
    },
  );

  return records.map(record => ({
    blockCode: Number(record.subdistrict_code),
    blockNameEnglish:
      record.subdistrict_name_english,
    districtCode: Number(record.district_code),
    stateCode: Number(record.state_code),
    dataLastUpdated: new Date(record.last_updated),
    blockNameLocal: record.subdistrict_name_local,
  }));
}

/* -------------------------------------------------------------------------- */
/* MongoDB                                                                    */
/* -------------------------------------------------------------------------- */

const client = new MongoClient(DB_URL);

await client.connect();

const db = client.db(DB_NAME);

const collection =
  db.collection(COLLECTION_NAME);

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

try {
  console.log(
    `\n🗄️  Database  : ${DB_NAME}` +
      `\n📦 Collection: ${COLLECTION_NAME}` +
      `\n🔧 Mode      : ${
        APPLY
          ? 'APPLY (will write)'
          : 'DRY RUN (no writes — pass --apply)'
      }\n`,
  );

  if (APPLY) {
    console.log(
      '🔧 Ensuring unique index on blockCode...',
    );

    await collection.createIndex(
      {
        blockCode: 1,
      },
      {
        unique: true,
      },
    );

    console.log('✅ Unique index ready.\n');
  }

  /* ---------------------------------------------------------------------- */
  /* Fetch states                                                            */
  /* ---------------------------------------------------------------------- */

  console.log(
    '🌐 Fetching states from LGD API...',
  );

  const states = await fetchStates();

  console.log(
    `✅ Fetched ${states.length} state(s).\n`,
  );

  /* ---------------------------------------------------------------------- */
  /* Fetch districts                                                         */
  /* ---------------------------------------------------------------------- */

  console.log(
    '🌐 Fetching districts per state from LGD API...',
  );

  const allDistricts = [];

  const failedStates = [];

  for (
    const [index, state] of
    states.entries()
  ) {
    try {
      const stateDistricts =
        await fetchDistrictsForState(
          state.stateCode,
        );

      allDistricts.push(
        ...stateDistricts,
      );

      console.log(
        `   [${index + 1}/${states.length}] ` +
          `${state.stateNameEnglish} ` +
          `(${state.stateCode}): ` +
          `${stateDistricts.length} district(s)`,
      );
    } catch (error) {
      failedStates.push(state);

      console.warn(
        `   ⚠️ [${index + 1}/${states.length}] ` +
          `${state.stateNameEnglish} ` +
          `(${state.stateCode}) failed: ` +
          `${error?.message || error}`,
      );
    }

    if (index < states.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(
    `\n✅ Fetched ${allDistricts.length} district(s) ` +
      `across ${
        states.length - failedStates.length
      }/${states.length} state(s).\n`,
  );

  if (failedStates.length > 0) {
    console.warn(
      `⚠️ Failed states: ${failedStates.length}`,
    );

    for (const state of failedStates) {
      console.warn(
        `   - ${state.stateNameEnglish} ` +
          `(${state.stateCode})`,
      );
    }

    console.log('');
  }

  if (allDistricts.length === 0) {
    console.log(
      'Nothing to process — no districts were fetched.',
    );

    process.exit(0);
  }

  /* ---------------------------------------------------------------------- */
  /* Fetch blocks and write incrementally                                   */
  /* ---------------------------------------------------------------------- */

  console.log(
    '🌐 Fetching blocks per district and ' +
      'saving incrementally...\n',
  );

  let totalBlocksFetched = 0;

  let totalBlocksInserted = 0;

  let totalBlocksUpdated = 0;

  let totalDistrictsProcessed = 0;

  const failedDistricts = [];

  let dryRunSampleShown = false;

  for (
    const [index, district] of
    allDistricts.entries()
  ) {
    try {
      const districtBlocks =
        await fetchBlocksForDistrict(
          district.districtCode,
        );

      totalDistrictsProcessed++;

      totalBlocksFetched +=
        districtBlocks.length;

      console.log(
        `   [${index + 1}/${allDistricts.length}] ` +
          `${district.districtNameEnglish} ` +
          `(${district.districtCode}): ` +
          `${districtBlocks.length} block(s)`,
      );

      if (
        districtBlocks.length > 0 &&
        !dryRunSampleShown &&
        !APPLY
      ) {
        console.log(
          '\nSample document that would be upserted:',
        );

        console.log(
          JSON.stringify(
            districtBlocks[0],
            null,
            2,
          ),
        );

        dryRunSampleShown = true;
      }

      if (APPLY && districtBlocks.length > 0) {
        const now = new Date();

        const bulkOps =
          districtBlocks.map(block => ({
            updateOne: {
              filter: {
                blockCode:
                  block.blockCode,
              },

              update: {
                $set: {
                  ...block,
                  updatedAt: now,
                },

                $setOnInsert: {
                  createdAt: now,
                },
              },

              upsert: true,
            },
          }));

        const result =
          await collection.bulkWrite(
            bulkOps,
            {
              ordered: false,
            },
          );

        totalBlocksInserted +=
          result.upsertedCount;

        totalBlocksUpdated +=
          result.modifiedCount;

        console.log(
          `      💾 Inserted: ${
            result.upsertedCount
          }, Updated: ${
            result.modifiedCount
          }`,
        );
      }
    } catch (error) {
      failedDistricts.push(district);

      console.warn(
        `   ⚠️ [${index + 1}/${allDistricts.length}] ` +
          `${district.districtNameEnglish} ` +
          `(${district.districtCode}) failed ` +
          `after ${MAX_ATTEMPTS} attempts: ` +
          `${error?.message || error}`,
      );
    }

    if (
      index < allDistricts.length - 1
    ) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Summary                                                                */
  /* ---------------------------------------------------------------------- */

  console.log(
    '\n✅ Finished processing all districts.',
  );

  console.log('\n📊 Summary:');

  console.log(
    `   - Total districts: ${
      allDistricts.length
    }`,
  );

  console.log(
    `   - Districts processed successfully: ${
      totalDistrictsProcessed
    }`,
  );

  console.log(
    `   - Total blocks fetched: ${
      totalBlocksFetched
    }`,
  );

  if (APPLY) {
    console.log(
      `   - Blocks inserted: ${
        totalBlocksInserted
      }`,
    );

    console.log(
      `   - Blocks updated: ${
        totalBlocksUpdated
      }`,
    );
  }

  if (failedStates.length > 0) {
    console.warn(
      `\n⚠️ Failed states: ${
        failedStates.length
      }`,
    );
  }

  if (failedDistricts.length > 0) {
    console.warn(
      `\n⚠️ Failed districts: ${
        failedDistricts.length
      }`,
    );

    for (const district of failedDistricts) {
      console.warn(
        `   - ${district.districtNameEnglish} ` +
          `(${district.districtCode})`,
      );
    }
  }

  if (!APPLY) {
    console.log(
      `\nℹ️ DRY RUN — would upsert ` +
        `${totalBlocksFetched} document(s) ` +
        `into "${COLLECTION_NAME}".`,
    );

    console.log(
      '   Re-run with --apply to write the changes.',
    );
  }

  console.log('\n🎉 Done.');
} catch (error) {
  console.error(
    `❌ Failed to create/populate ` +
      `${COLLECTION_NAME} collection:`,
    error?.message || error,
  );

  process.exitCode = 1;
} finally {
  await client.close();
}