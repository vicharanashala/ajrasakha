/**
 * Split pipe-separated `details.domain` values into a proper array.
 *
 * Some questions store multiple domains as a single string (or a one-element array)
 * joined by " | ", e.g.
 *     details.domain = "Weed Management | Irrigation and Water Management"
 *   or
 *     details.domain = ["Weed Management | Irrigation and Water Management"]
 *
 * This rewrites them to a clean array, one domain per element:
 *     details.domain = ["Weed Management", "Irrigation and Water Management"]
 *
 * The old value is REPLACED (not merged). Each part is trimmed and empties dropped.
 * An optional leading "Multiple Domains:" label on the value is stripped first.
 * Documents whose domain has no "|" are left untouched, so it is safe to re-run.
 *
 * SAFETY: dry-run by default — it only writes when you pass --apply.
 *
 * Usage:
 *   node scripts/split-multiple-domains.js            # dry run (shows a sample + counts)
 *   node scripts/split-multiple-domains.js --apply    # performs the update
 *   node scripts/split-multiple-domains.js --limit=20 # cap how many are processed
 *
 * Read-only unless --apply. Reads DB_URL / DB_NAME from the environment (.env auto-loaded).
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
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(0, parseInt(limitArg.slice('--limit='.length), 10) || 0) : 0;

/** Normalize a raw details.domain (string OR array) into a clean, split array.
 *  Splits every value on "|", strips an optional leading "Multiple Domains:" label,
 *  trims each part and drops empties. */
const splitDomains = raw => {
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .filter(v => typeof v === 'string')
    .flatMap(v => v.replace(/^\s*multiple domains\s*:/i, '').split('|'))
    .map(s => s.trim())
    .filter(Boolean);
};

/** Same two arrays (order-sensitive)? Used to skip no-op writes. */
const sameArray = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((v, i) => v === b[i]);

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');

  // Match docs where details.domain contains a "|" — a regex matches both a plain
  // string and any element of an array.
  const filter = { 'details.domain': { $regex: '\\|' } };

  const matched = await questions.countDocuments(filter);
  console.log('========== Split multiple domains ==========');
  console.log(`DB: ${DB_NAME}`);
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes — pass --apply)'}`);
  console.log(`Questions with a "|" in details.domain: ${matched}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);

  if (matched === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  let cursor = questions.find(filter, {
    projection: { 'details.domain': 1 },
  });
  if (LIMIT) cursor = cursor.limit(LIMIT);

  const ops = [];
  let skippedNoChange = 0;
  let previewShown = 0;

  for await (const doc of cursor) {
    const before = doc.details?.domain;
    const after = splitDomains(before);

    if (after.length === 0 || sameArray(before, after)) {
      skippedNoChange++;
      continue;
    }

    if (previewShown < 10) {
      console.log(
        `  ${doc._id}: ${JSON.stringify(before)}  →  ${JSON.stringify(after)}`,
      );
      previewShown++;
    }

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { 'details.domain': after, updatedAt: new Date() } },
      },
    });
  }

  console.log(`\nTo update : ${ops.length}`);
  console.log(`Unchanged : ${skippedNoChange}`);

  if (!APPLY) {
    console.log('\nDRY RUN — no writes performed. Re-run with --apply to update.');
    process.exit(0);
  }

  if (ops.length === 0) {
    console.log('Nothing to write.');
    process.exit(0);
  }

  const res = await questions.bulkWrite(ops, { ordered: false });
  console.log(`\n✅ Modified ${res.modifiedCount} question(s).`);
} finally {
  await client.close();
}
