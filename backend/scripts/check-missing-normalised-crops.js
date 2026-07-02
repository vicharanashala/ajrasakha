/**
 * Report `details.normalised_crop` values that exist on questions but are NOT
 * present as a crop `name` in the crop_master collection.
 *
 * Output:
 *   - each missing normalised_crop name + how many question documents carry it
 *   - the number of distinct missing crop names
 *   - the total number of question documents affected
 *
 * Read-only: this script never writes anything.
 *
 * Matching is case-insensitive and trims surrounding whitespace, mirroring how
 * crops are resolved elsewhere (findByNameOrAlias). Only the crop `name` field is
 * compared — aliases are intentionally ignored, since normalised_crop is meant to
 * hold the canonical crop name.
 *
 * Usage:
 *   node scripts/check-missing-normalised-crops.js
 *   node scripts/check-missing-normalised-crops.js --json   # machine-readable output
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

const AS_JSON = process.argv.includes('--json');
const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');
  const cropMaster = db.collection('crop_master');

  // 1. Build the set of known crop names (lower-cased, trimmed) from crop_master.
  const cropDocs = await cropMaster
    .find({}, { projection: { name: 1 } })
    .toArray();
  const knownCropNames = new Set(
    cropDocs.map((c) => norm(c.name)).filter(Boolean),
  );

  // 2. Group questions by normalised_crop (only docs that actually carry a
  //    non-empty normalised_crop string) and count documents per value.
  const grouped = await questions
    .aggregate([
      {
        $match: {
          'details.normalised_crop': { $type: 'string', $ne: '' },
        },
      },
      {
        $group: {
          _id: '$details.normalised_crop',
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  // 3. Keep only the normalised_crop values that are NOT in crop_master.
  //    Merge case/whitespace variants that map to the same missing name.
  const missingByKey = new Map();
  for (const row of grouped) {
    const original = row._id;
    const key = norm(original);
    if (!key || knownCropNames.has(key)) continue;
    const existing = missingByKey.get(key);
    if (existing) {
      existing.count += row.count;
      existing.variants.add(original);
    } else {
      missingByKey.set(key, {
        normalised_crop: original,
        count: row.count,
        variants: new Set([original]),
      });
    }
  }

  const missing = [...missingByKey.values()]
    .map((m) => ({
      normalised_crop: m.normalised_crop,
      count: m.count,
      variants: [...m.variants],
    }))
    .sort((a, b) => b.count - a.count);

  const totalDocumentsAffected = missing.reduce((sum, m) => sum + m.count, 0);

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          db: DB_NAME,
          missingCropCount: missing.length,
          totalDocumentsAffected,
          missing,
        },
        null,
        2,
      ),
    );
  } else {
    console.log('====== Missing normalised_crop in crop_master ======');
    console.log(`DB: ${DB_NAME}`);
    console.log(`Known crops in crop_master        : ${knownCropNames.size}`);
    console.log(`Distinct normalised_crop values   : ${grouped.length}`);
    console.log(`Distinct MISSING crop names        : ${missing.length}`);
    console.log(`Total question docs affected       : ${totalDocumentsAffected}`);
    console.log('====================================================');
    if (!missing.length) {
      console.log('\n✅ Every normalised_crop on questions exists in crop_master.');
    } else {
      console.log('\nMissing crop name → document count (highest first):\n');
      for (const m of missing) {
        const variantNote =
          m.variants.length > 1
            ? `   [variants: ${m.variants.join(' | ')}]`
            : '';
        console.log(`  ${m.count.toString().padStart(6)}  ${m.normalised_crop}${variantNote}`);
      }
    }
  }
} catch (err) {
  console.error('❌ Script failed:', err);
  process.exitCode = 1;
} finally {
  await client.close();
}
