/**
 * One-time migration script: Title-case all crop names in crop_master and questions.
 *
 * Rule: capitalize the first letter of every space-separated word.
 *   "ragi"         → "Ragi"
 *   "fal ful"      → "Fal Ful"
 *   "fal ful mal"  → "Fal Ful Mal"
 *
 * Collections updated:
 *   1. crop_master          → `name` field
 *   2. questions            → `details.normalised_crop` field
 *
 * Run:
 *   cd backend
 *   pnpm build && node build/scripts/titleCaseCropNames.js
 */

import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config();

const MONGO_URI = process.env.DB_URL || process.env.MONGO_URI || process.env.DATABASE_URL || '';
const DB_NAME   = process.env.DB_NAME || process.env.DATABASE_NAME || '';

if (!MONGO_URI || !DB_NAME) {
  console.error('❌  DB_URL and DB_NAME must be set in your .env file.');
  process.exit(1);
}

function toTitleCase(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function main() {
  console.log('🔌  Connecting to MongoDB...');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const cropCol      = db.collection('crop_master');
  const questionsCol = db.collection('questions');

  // ── 1. crop_master ────────────────────────────────────────────────────────
  console.log('\n📦  Processing crop_master...');

  const crops = await cropCol.find({}, { projection: { _id: 1, name: 1 } }).limit(500).toArray();
  console.log(`    Found ${crops.length} documents.`);

  let cropUpdated = 0;
  let cropSkipped = 0;

  for (const crop of crops) {
    const original = crop.name as string;
    if (!original) { cropSkipped++; continue; }

    const titled = toTitleCase(original);

    if (titled === original) {
      cropSkipped++;
      continue;
    }

    // Check if a doc with the titled name already exists (avoid duplicate key error)
    const conflict = await cropCol.findOne({ name: titled, _id: { $ne: crop._id } });
    if (conflict) {
      console.log(`  ⚠️   Conflict — "${titled}" already exists; skipping "${original}" (manual review needed)`);
      cropSkipped++;
      continue;
    }

    await cropCol.updateOne(
      { _id: crop._id },
      { $set: { name: titled, updatedAt: new Date() } },
    );
    console.log(`  ✏️   crop_master  |  original: "${original}"  →  updated: "${titled}"`);
    cropUpdated++;
  }

  console.log(`\n    ✅  Updated: ${cropUpdated}  |  Skipped (already correct / conflict): ${cropSkipped}`);

  // ── 2. questions.details.normalised_crop ────────────────────────────────
  console.log('\n📋  Processing questions.details.normalised_crop...');

  const questions = await questionsCol
    .find(
      { 'details.normalised_crop': { $exists: true, $ne: null } },
      { projection: { _id: 1, 'details.normalised_crop': 1 } },
    )
    .limit(2)
    .toArray();

  console.log(`    Found ${questions.length} documents with normalised_crop.`);

  let qUpdated = 0;
  let qSkipped = 0;

  for (const q of questions) {
    const original = q.details?.normalised_crop as string;
    if (!original) { qSkipped++; continue; }

    const titled = toTitleCase(original);

    if (titled === original) {
      qSkipped++;
      continue;
    }

    await questionsCol.updateOne(
      { _id: q._id },
      { $set: { 'details.normalised_crop': titled, updatedAt: new Date() } },
    );
    console.log(`  ✏️   questions     |  original: "${original}"  →  updated: "${titled}"`);
    qUpdated++;
  }

  console.log(`    ✅  Updated: ${qUpdated}  |  Skipped (already correct): ${qSkipped}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log('📊  Summary');
  console.log('─'.repeat(50));
  console.log(`  crop_master updated        : ${cropUpdated}`);
  console.log(`  crop_master skipped        : ${cropSkipped}`);
  console.log(`  questions updated          : ${qUpdated}`);
  console.log(`  questions skipped          : ${qSkipped}`);

  await client.close();
  console.log('\n🎉  Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
