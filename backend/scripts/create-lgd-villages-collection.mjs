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
 *    MongoDB collection. It utilizes worker threads to process multiple
 *    blocks concurrently.
 *
 *  The script:
 *    1. Main thread reads all blocks from the `blocks` MongoDB collection.
 *    2. Main thread chunks blocks and spawns N workers.
 *    3. Worker threads fetch villages for their blocks.
 *    4. Worker threads write villages incrementally.
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
 *    Retries (localized per worker):
 *      • HTTP 429 — Too Many Requests
 *      • HTTP 5xx — Server errors
 *      • Network/timeout errors
 *
 *    Uses exponential backoff with random jitter.
 *    When a 429 occurs, a thread-local cooldown is applied before the next request.
 *
 * ============================================================================ */

import 'dotenv/config';
import axios from 'axios';
import { MongoClient } from 'mongodb';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';

const APPLY = process.argv.includes('--apply');

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';

const LGD_API_KEY = process.env.LGD_API_KEY;
const LGD_VILLAGES_API_URL = process.env.LGD_VILLAGES_API_URL;

const BLOCKS_COLLECTION = 'blocks';
const COLLECTION_NAME = 'villages';

const NUM_WORKERS = parseInt(process.env.NUM_WORKERS || '5', 10);

const REQUEST_DELAY_MS = 1000;
const MAX_ATTEMPTS = 6;
const INITIAL_BACKOFF_MS = 10_000;
const MAX_GLOBAL_COOLDOWN_MS = 120_000;
const MAX_JITTER_MS = 2000;

if (!DB_URL || !LGD_API_KEY || !LGD_VILLAGES_API_URL) {
  if (isMainThread) {
    console.error('❌ Missing required environment variables (DB_URL, LGD_API_KEY, LGD_VILLAGES_API_URL).');
    process.exit(1);
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const getRandomJitter = () => Math.floor(Math.random() * MAX_JITTER_MS);

// -----------------------------------------------------------------------------
// WORKER THREAD LOGIC
// -----------------------------------------------------------------------------
if (!isMainThread) {
  const { workerId, blocks, apply } = workerData;
  let threadCooldownMs = 0;

  async function waitBeforeRequest() {
    if (threadCooldownMs > 0) {
      // Avoid excessive logging; workers wait silently
      await sleep(threadCooldownMs);
    }
  }

  function increaseCooldown() {
    if (threadCooldownMs === 0) {
      threadCooldownMs = 10_000;
    } else {
      threadCooldownMs = Math.min(threadCooldownMs * 2, MAX_GLOBAL_COOLDOWN_MS);
    }
  }

  function reduceCooldown() {
    if (threadCooldownMs > 0) {
      threadCooldownMs = Math.floor(threadCooldownMs / 2);
      if (threadCooldownMs < 1000) threadCooldownMs = 0;
    }
  }

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
        const response = await axios.get(apiUrl, { params, timeout: 30_000 });
        if (!response?.data?.records) {
          throw new Error('Invalid LGD API response: records missing');
        }
        reduceCooldown();
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
          increaseCooldown();
        }

        const retryDelayMs = backoffMs + getRandomJitter();
        await sleep(retryDelayMs);
        backoffMs *= 2;
      }
    }
    throw new Error('Unexpected retry loop termination.');
  }


  async function fetchVillagesForBlock(blockCode) {
    const records = await makeLgdRequest(LGD_VILLAGES_API_URL, { subdistrictCode: blockCode });
    return records.map(record => ({
      villageCode: Number(record.villageCode),
      villageNameEnglish: record.villageNameEnglish,
      blockCode: Number(blockCode),
      stateCode: Number(record.stateCode),
      districtCode: Number(record.districtCode),
      districtNameLocal: record.districtNameLocal,
    }));
  }

  async function runWorker() {
    const client = new MongoClient(DB_URL);
    await client.connect();
    const db = client.db(DB_NAME);
    const villagesCollection = db.collection(COLLECTION_NAME);

    let totalVillagesFetched = 0;
    let totalVillagesInserted = 0;
    let totalVillagesUpdated = 0;
    let totalBlocksProcessed = 0;
    const failedBlocks = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      try {
        const blockVillages = await fetchVillagesForBlock(block.blockCode);
        totalBlocksProcessed++;
        totalVillagesFetched += blockVillages.length;

        // Post progress to main thread to log
        parentPort.postMessage({
          type: 'progress',
          blockName: block.blockNameEnglish,
          blockCode: block.blockCode,
          villageCount: blockVillages.length,
          sample: blockVillages.length > 0 ? blockVillages[0] : null
        });

        if (apply && blockVillages.length > 0) {
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

          const result = await villagesCollection.bulkWrite(bulkOps, { ordered: false });
          totalVillagesInserted += result.upsertedCount;
          totalVillagesUpdated += result.modifiedCount;
        }
      } catch (error) {
        failedBlocks.push(block);
        parentPort.postMessage({
          type: 'error',
          blockName: block.blockNameEnglish,
          blockCode: block.blockCode,
          message: error?.message || String(error)
        });
      }

      if (i < blocks.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    await client.close();
    
    parentPort.postMessage({
      type: 'done',
      stats: {
        totalBlocksProcessed,
        totalVillagesFetched,
        totalVillagesInserted,
        totalVillagesUpdated,
        failedBlocks
      }
    });
  }

  runWorker().catch(err => {
    console.error(`Worker ${workerId} failed fatally:`, err);
    process.exit(1);
  });
} 

// -----------------------------------------------------------------------------
// MAIN THREAD LOGIC
// -----------------------------------------------------------------------------
else {
  const client = new MongoClient(DB_URL);
  
  async function runMain() {
    await client.connect();
    const db = client.db(DB_NAME);
    const blocksCollection = db.collection(BLOCKS_COLLECTION);
    const villagesCollection = db.collection(COLLECTION_NAME);

    console.log(
      `\n🗄️  Database  : ${DB_NAME}` +
        `\n📦 Collection: ${COLLECTION_NAME}` +
        `\n🔧 Mode      : ${
          APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes — pass --apply)'
        }` +
        `\n🚀 Workers   : ${NUM_WORKERS}\n`
    );

    if (APPLY) {
      console.log('🔧 Ensuring unique index on villageCode...');
      await villagesCollection.createIndex({ villageCode: 1 }, { unique: true });
      console.log('✅ Unique index ready.\n');
    }

    let blockQuery = {};
    const blocksArg = process.argv.find(arg => arg.startsWith('--blocks='));
    if (blocksArg) {
      const blockCodesStr = blocksArg.split('=')[1];
      const blockCodes = blockCodesStr.split(',').map(c => Number(c.trim()));
      blockQuery = { blockCode: { $in: blockCodes } };
      console.log(`🎯 Targeting specific blocks: ${blockCodes.join(', ')}`);
    } else if (process.argv.includes('--retry-missing')) {
      console.log('🔍 Finding blocks that have no villages in the database...');
      const villageBlocks = await villagesCollection.distinct("blockCode");
      blockQuery = { blockCode: { $nin: villageBlocks } };
    }

    console.log('🌐 Fetching blocks from MongoDB...');
    const allBlocks = await blocksCollection.find(blockQuery).sort({ blockCode: 1 }).toArray();
    if (process.argv.includes('--retry-missing')) {
        console.log(`🎯 Targeting ${allBlocks.length} missing block(s).`);
    } else {
        console.log(`✅ Found ${allBlocks.length} block(s).\n`);
    }

    if (allBlocks.length === 0) {
      console.log('Nothing to process — no blocks were found in MongoDB.');
      await client.close();
      process.exit(0);
    }

    // Chunk the blocks
    const chunks = [];
    const chunkSize = Math.ceil(allBlocks.length / NUM_WORKERS);
    for (let i = 0; i < NUM_WORKERS; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      if (start < allBlocks.length) {
        chunks.push(allBlocks.slice(start, end));
      }
    }

    console.log(`🌐 Splitting blocks into ${chunks.length} chunk(s) and starting workers...\n`);

    const filename = fileURLToPath(import.meta.url);

    let globalTotalVillagesFetched = 0;
    let globalTotalVillagesInserted = 0;
    let globalTotalVillagesUpdated = 0;
    let globalTotalBlocksProcessed = 0;
    let globalFailedBlocks = [];
    
    let blocksCompleted = 0;
    let dryRunSampleShown = false;

    const workerPromises = chunks.map((chunk, index) => {
      return new Promise((resolve, reject) => {
        const workerId = index + 1;
        const worker = new Worker(filename, {
          workerData: { workerId, blocks: chunk, apply: APPLY }
        });

        worker.on('message', (msg) => {
          if (msg.type === 'progress') {
            blocksCompleted++;
            console.log(`   [Worker ${workerId}] [${blocksCompleted}/${allBlocks.length}] ${msg.blockName} (${msg.blockCode}): ${msg.villageCount} village(s)`);
            
            if (msg.sample && !dryRunSampleShown && !APPLY) {
              console.log('\nSample document that would be upserted:');
              console.log(JSON.stringify(msg.sample, null, 2));
              dryRunSampleShown = true;
            }
          } else if (msg.type === 'error') {
            console.warn(`   ⚠️ [Worker ${workerId}] ${msg.blockName} (${msg.blockCode}) failed after ${MAX_ATTEMPTS} attempts: ${msg.message}`);
          } else if (msg.type === 'done') {
            globalTotalBlocksProcessed += msg.stats.totalBlocksProcessed;
            globalTotalVillagesFetched += msg.stats.totalVillagesFetched;
            globalTotalVillagesInserted += msg.stats.totalVillagesInserted;
            globalTotalVillagesUpdated += msg.stats.totalVillagesUpdated;
            globalFailedBlocks.push(...msg.stats.failedBlocks);
            resolve();
          }
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker ${workerId} stopped with exit code ${code}`));
          }
        });
      });
    });

    await Promise.all(workerPromises);

    console.log('\n✅ Finished processing all blocks.');
    console.log('\n📊 Summary:');
    console.log(`   - Total blocks: ${allBlocks.length}`);
    console.log(`   - Blocks processed successfully: ${globalTotalBlocksProcessed}`);
    console.log(`   - Total villages fetched: ${globalTotalVillagesFetched}`);

    if (APPLY) {
      console.log(`   - Villages inserted: ${globalTotalVillagesInserted}`);
      console.log(`   - Villages updated: ${globalTotalVillagesUpdated}`);
    }

    if (globalFailedBlocks.length > 0) {
      console.warn(`\n⚠️ Failed blocks: ${globalFailedBlocks.length}`);
      for (const block of globalFailedBlocks) {
        console.warn(`   - ${block.blockNameEnglish} (${block.blockCode})`);
      }
    }

    if (!APPLY) {
      console.log(`\nℹ️ DRY RUN — would upsert ${globalTotalVillagesFetched} document(s) into "${COLLECTION_NAME}".`);
      console.log('   Re-run with --apply to write the changes.');
    }

    console.log('\n🎉 Done.');
    await client.close();
  }

  runMain().catch(async (error) => {
    console.error(`❌ Failed to run main thread:`, error?.message || error);
    await client.close();
    process.exitCode = 1;
  });
}
