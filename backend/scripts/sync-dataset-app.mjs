#!/usr/bin/env node

/**
 * ============================================================================
 *  sync-dataset-app.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/sync-dataset-app.mjs          # dry run (default)
 *      node scripts/sync-dataset-app.mjs --apply  # actually write
 *
 *  What it does:
 *    Syncs the `users`, `questions`, and `answers` collections FROM the
 *    Review System's MongoDB (DB_URL / DB_NAME — same vars
 *    backend/src/config/db.ts already uses) INTO the Dataset Application's
 *    MongoDB (DATASET_APP_DB_URL / DATASET_APP_DB_NAME), so both databases stay
 *    consistent on a daily cadence.
 *
 *  Matching / update strategy:
 *    • Records are matched 1:1 on the shared `_id` (ObjectId) — both systems
 *      use the same id for the same logical record.
 *    • Existing destination documents are updated via `$set` of every
 *      top-level field present on the source document (plus a refreshed
 *      `updatedAt`). This is NOT a `replaceOne` — any field that exists only
 *      on the destination document (e.g. Dataset-Application-only fields
 *      that have no equivalent field name on the source) is left untouched.
 *      A field that exists on both sides is fully overwritten with the
 *      source's value.
 *    • Missing destination documents are inserted (`upsert: true`), with
 *      `createdAt` taken from the source document if present, else "now".
 *    • Records deleted from the Review System are intentionally left alone
 *      in the Dataset Application — this script only creates and updates,
 *      never deletes.
 *
 *  Collections (processed in this order — users, then questions, then
 *  answers — to keep logs/behavior predictable; not required for
 *  correctness since matching is by shared `_id`, not by re-derived
 *  references):
 *    • users
 *    • questions
 *    • answers
 *
 *  Safe to re-run: every write is an upsert matched on `_id`, so re-running
 *  never creates duplicates. `_id` is already uniquely indexed by MongoDB —
 *  no extra index needed.
 *
 *  Reads DB_URL / DB_NAME (source — Review System) and DATASET_APP_DB_URL /
 *  DATASET_APP_DB_NAME (destination — Dataset Application) from backend/.env.
 * ============================================================================
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');

const SOURCE_URL = process.env.DB_URL;
const SOURCE_DB_NAME = process.env.DB_NAME || 'agriai';
if (!SOURCE_URL) {
  console.error('❌ DB_URL is not set (put it in .env).');
  process.exit(1);
}

const DEST_URL = process.env.DATASET_APP_DB_URL;
const DEST_DB_NAME = process.env.DATASET_APP_DB_NAME;
if (!DEST_URL) {
  console.error('❌ DATASET_APP_DB_URL is not set (put it in .env).');
  process.exit(1);
}
if (!DEST_DB_NAME) {
  console.error('❌ DATASET_APP_DB_NAME is not set (put it in .env).');
  process.exit(1);
}

// Order matters only for predictable logging (see file header) — not for
// correctness, since matching is on shared `_id`.
const COLLECTIONS = ['users', 'questions', 'answers'];

/**
 * Syncs one collection from the source db into the destination db.
 * Returns { read, upsertedCount, modifiedCount, matchedCount }.
 */
async function syncCollection(sourceDb, destDb, name) {
  const sourceDocs = await sourceDb.collection(name).find({}).toArray();

  if (!APPLY) {
    console.log(`\n📦 Collection: ${name}`);
    console.log(`   Found ${sourceDocs.length} document(s) in the Review System.`);
    if (sourceDocs.length > 0) {
      console.log('   Sample document that would be upserted (as-is, minus _id noise):');
      console.log('  ', JSON.stringify(sourceDocs[0], null, 2).split('\n').join('\n   '));
    }
    return { read: sourceDocs.length, upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
  }

  if (sourceDocs.length === 0) {
    console.log(`\n📦 Collection: ${name} — nothing to sync (source is empty).`);
    return { read: 0, upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
  }

  const now = new Date();
  const destCollection = destDb.collection(name);

  const bulkOps = sourceDocs.map(doc => {
    const { _id, createdAt, ...rest } = doc;
    return {
      updateOne: {
        filter: { _id },
        update: {
          $set: { ...rest, updatedAt: now },
          $setOnInsert: { createdAt: createdAt ?? now },
        },
        upsert: true,
      },
    };
  });

  const result = await destCollection.bulkWrite(bulkOps);

  console.log(
    `\n📦 Collection: ${name}` +
      `\n   Read ${sourceDocs.length} document(s) from the Review System.` +
      `\n   ✅ Upserted into Dataset Application: ${result.upsertedCount} inserted, ` +
      `${result.modifiedCount} updated (${result.matchedCount} matched).`,
  );

  return {
    read: sourceDocs.length,
    upsertedCount: result.upsertedCount,
    modifiedCount: result.modifiedCount,
    matchedCount: result.matchedCount,
  };
}

const sourceClient = new MongoClient(SOURCE_URL);
const destClient = new MongoClient(DEST_URL);

try {
  console.log(
    `\n🗄️  Source      : ${SOURCE_DB_NAME} (Review System)` +
      `\n🗄️  Destination : ${DEST_DB_NAME} (Dataset Application)` +
      `\n📦 Collections : ${COLLECTIONS.join(', ')}` +
      `\n🔧 Mode        : ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes — pass --apply)'}\n`,
  );

  await sourceClient.connect();
  await destClient.connect();

  const sourceDb = sourceClient.db(SOURCE_DB_NAME);
  const destDb = destClient.db(DEST_DB_NAME);

  if (APPLY) {
    console.log('\n🛡️  Performing safety check (verifying destination database identity)...');
    
    const collections = await destDb.listCollections({ name: 'dataset_users' }).toArray();
    
    if (collections.length === 0) {
      throw new Error(
        `Safety check failed: The destination database does not contain the 'dataset_users' collection. ` +
        `Aborting to prevent potential data loss.`
      );
    }
    
    console.log('   ✅ Safety check passed (destination is correct).');
  }

  const summary = {};
  for (const name of COLLECTIONS) {
    summary[name] = await syncCollection(sourceDb, destDb, name);
  }

  if (!APPLY) {
    console.log(
      '\nℹ️  DRY RUN — no writes were made.' + '\n   Re-run with --apply to sync the changes.',
    );
  } else {
    console.log('\n🎉 Done. Summary:');
    for (const [name, stats] of Object.entries(summary)) {
      console.log(
        `   ${name}: read ${stats.read}, inserted ${stats.upsertedCount}, ` +
          `updated ${stats.modifiedCount}, matched ${stats.matchedCount}`,
      );
    }
  }
} catch (error) {
  console.error('❌ Failed to sync Review System data:', error?.message || error);
  process.exitCode = 1;
} finally {
  await sourceClient.close();
  await destClient.close();
}
