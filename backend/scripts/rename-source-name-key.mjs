#!/usr/bin/env node

/**
 * ============================================================================
 *  rename-source-name-key.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/rename-source-name-key.mjs              # dry run (default)
 *      node scripts/rename-source-name-key.mjs --apply       # actually write
 *      node scripts/rename-source-name-key.mjs --apply --yes # skip confirmation
 *
 *  What it does:
 *    Renames the snake_case `source_name` key to `sourceName` inside source arrays.
 *    Some records (AI/ACC-service payloads persisted without normalisation) stored the
 *    name as `source_name`, while the app reads `sourceName` — so moderators saw only
 *    the source type with the name missing.
 *
 *  Collections / fields touched:
 *    • answers.sources[]
 *    • questions.aiApprovedSources[]
 *
 *  Rules:
 *    • If an element has BOTH keys, the existing `sourceName` wins and `source_name`
 *      is simply dropped (never overwrite the canonical value).
 *    • A blank/whitespace-only `source_name` is dropped without creating `sourceName`.
 *    • Every other key on the element (source, page, sourceType, …) is preserved.
 *
 *  Safe to re-run: once renamed, documents no longer match the filter.
 *  Read-only unless --apply is passed. Reads DB_URL / DB_NAME from backend/.env.
 * ============================================================================
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import readline from 'node:readline/promises';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_CONFIRM = args.includes('--yes');

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

/** The array fields that hold SourceItem objects. */
const TARGETS = [
  { collection: 'answers', field: 'sources' },
  { collection: 'questions', field: 'aiApprovedSources' },
];

/**
 * Aggregation-pipeline update that rewrites each element of `field`:
 * drops the `source_name` key and, when there is a usable name, sets `sourceName`.
 * ($rename cannot reach inside array elements, hence the $map.)
 */
const buildPipeline = field => [
  {
    $set: {
      [field]: {
        $map: {
          input: `$${field}`,
          as: 's',
          in: {
            $let: {
              vars: {
                // Prefer an existing sourceName; fall back to the snake_case one.
                name: {
                  $trim: {
                    input: {
                      $ifNull: [
                        '$$s.sourceName',
                        { $ifNull: ['$$s.source_name', ''] },
                      ],
                    },
                  },
                },
              },
              in: {
                $mergeObjects: [
                  // Every key except source_name / sourceName, preserved as-is.
                  {
                    $arrayToObject: {
                      $filter: {
                        input: { $objectToArray: '$$s' },
                        cond: {
                          $not: {
                            $in: ['$$this.k', ['source_name', 'sourceName']],
                          },
                        },
                      },
                    },
                  },
                  // Re-add the canonical key only when we actually have a name.
                  {
                    $cond: [
                      { $eq: ['$$name', ''] },
                      {},
                      { sourceName: '$$name' },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
];

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  console.log(
    `\n🗄️  Database : ${DB_NAME}` +
      `\n🔧 Mode     : ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}\n`,
  );

  let grandTotal = 0;
  const plan = [];

  for (const { collection, field } of TARGETS) {
    const col = db.collection(collection);
    const filter = { [`${field}.source_name`]: { $exists: true } };
    const count = await col.countDocuments(filter);
    grandTotal += count;
    plan.push({ collection, field, col, filter, count });

    console.log(`📦 ${collection}.${field}`);
    console.log(`   documents with a source_name element: ${count}`);

    if (count > 0) {
      const sample = await col.findOne(filter, { projection: { [field]: 1 } });
      const before = (sample?.[field] ?? []).find(s => s && s.source_name);
      console.log(`   sample BEFORE: ${JSON.stringify(before)}`);
      // Show what the same element will look like afterwards.
      const [preview] = await col
        .aggregate([
          { $match: { _id: sample._id } },
          ...buildPipeline(field),
          { $project: { [field]: 1 } },
        ])
        .toArray();
      const after = (preview?.[field] ?? []).find(
        s => s && s.source === before?.source,
      );
      console.log(`   sample AFTER : ${JSON.stringify(after)}\n`);
    } else {
      console.log('   nothing to do\n');
    }
  }

  if (grandTotal === 0) {
    console.log('✅ No documents use `source_name` — nothing to migrate.');
    process.exit(0);
  }

  if (!APPLY) {
    console.log(
      `ℹ️  DRY RUN — ${grandTotal} document(s) would be updated.` +
        `\n   Re-run with --apply to write the changes.`,
    );
    process.exit(0);
  }

  if (!SKIP_CONFIRM) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await rl.question(
      `\n⚠️  About to update ${grandTotal} document(s) in "${DB_NAME}". Type "yes" to continue: `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Aborted — nothing was written.');
      process.exit(0);
    }
  }

  for (const { collection, field, col, filter, count } of plan) {
    if (count === 0) continue;
    const res = await col.updateMany(filter, buildPipeline(field));
    console.log(
      `✅ ${collection}.${field}: matched ${res.matchedCount}, modified ${res.modifiedCount}`,
    );
    const remaining = await col.countDocuments(filter);
    console.log(`   remaining with source_name: ${remaining}`);
  }

  console.log('\n🎉 Done.');
} finally {
  await client.close();
}
