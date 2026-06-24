/**
 * Backfill autoAllocateModerator on EXISTING questions (those missing the field):
 *   - status === 'duplicate'  → false  (existing duplicates are NOT auto-allocated)
 *   - everything else (e.g. in-review) → true (eligible for moderator auto-allocation)
 *
 * New questions already default to true on creation. Only documents that don't carry
 * the field are touched, so it is safe to re-run (it won't clobber values a moderator
 * set via the UI toggle).
 *
 * SAFETY: dry-run by default. It only writes when you pass --apply.
 *
 * Usage:
 *   node scripts/backfill-auto-allocate-moderator.js          # dry run (counts only)
 *   node scripts/backfill-auto-allocate-moderator.js --apply  # performs the update
 *
 * Reads DB_URL / DB_NAME from the environment (.env is auto-loaded).
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');

  // Only touch documents that don't already carry the field — never overwrite a
  // value a moderator may have set via the toggle.
  const missingField = { autoAllocateModerator: { $exists: false } };
  // Duplicates → false; every other status → true.
  const duplicateFilter = { ...missingField, status: 'duplicate' };
  const otherFilter = { ...missingField, status: { $ne: 'duplicate' } };

  const total = await questions.countDocuments({});
  const missing = await questions.countDocuments(missingField);
  const duplicateCount = await questions.countDocuments(duplicateFilter);
  const otherCount = await questions.countDocuments(otherFilter);

  console.log('========== Backfill autoAllocateModerator ==========');
  console.log(`DB: ${DB_NAME}`);
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes — pass --apply)'}`);
  console.log(`Total questions               : ${total}`);
  console.log(`Missing field (to backfill)   : ${missing}`);
  console.log(`  duplicate  → false          : ${duplicateCount}`);
  console.log(`  non-duplicate → true        : ${otherCount}`);
  console.log('====================================================');

  if (!missing) {
    console.log('\nNothing to backfill — every question already has the field.');
  } else if (!APPLY) {
    console.log(
      `\nDRY RUN — would set ${duplicateCount} duplicate question(s) to false and ${otherCount} other question(s) to true. Re-run with --apply.`,
    );
  } else {
    const [dupRes, otherRes] = await Promise.all([
      questions.updateMany(duplicateFilter, {
        $set: { autoAllocateModerator: false, updatedAt: new Date() },
      }),
      questions.updateMany(otherFilter, {
        $set: { autoAllocateModerator: true, updatedAt: new Date() },
      }),
    ]);
    console.log(`\n✅ duplicate → false : updated ${dupRes.modifiedCount}`);
    console.log(`✅ other → true      : updated ${otherRes.modifiedCount}`);
  }
} catch (err) {
  console.error('❌ Backfill failed:', err);
  process.exitCode = 1;
} finally {
  await client.close();
}
