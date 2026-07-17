/**
 * Normalise the CASING of details.state / details.district on the questions collection.
 *
 * WHY: the same place is stored several ways — 'MADHYA PRADESH' (1,614 docs) alongside
 * 'Madhya Pradesh', 'HOSHANGABAD' alongside 'Hoshangabad'. LGD supplies title-case names,
 * so any exact-match query silently under-counts (the district drill-down returned 0 for
 * MANDLA), and the same state shows up twice in "Top States". Reads are now
 * case-insensitive, but normalising at rest keeps every future exact match honest.
 *
 * CANONICAL FORM: chosen from the values already present — the variant that is neither
 * ALL-UPPER nor all-lower (i.e. the already-properly-cased one, e.g. 'Madhya Pradesh').
 * Only if no such variant exists does it fall back to Title Case. Nothing is invented, so
 * oddities like 'S.A.S Nagar' survive untouched.
 *
 * SAFETY: dry-run by default. It only writes when you pass --apply.
 *   - Sentinel values ('', 'all', 'All', null) are left alone.
 *   - Groups that already agree on one casing are skipped.
 *   - Re-runnable: a second run is a no-op.
 *
 * Usage:
 *   node scripts/normalise-state-district-casing.mjs                    # dry run (default)
 *   node scripts/normalise-state-district-casing.mjs --apply            # perform updates
 *   node scripts/normalise-state-district-casing.mjs --field=details.state
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
const fieldArg = process.argv.find(a => a.startsWith('--field='));
const FIELDS = fieldArg
  ? [fieldArg.split('=')[1]]
  : ['details.state', 'details.district'];

/** Values that aren't real place names — never touch them. */
const SENTINELS = ['', 'all', 'unknown', '<unknown>', 'not specified', 'n/a'];

const isAllUpper = s => s === s.toUpperCase() && s !== s.toLowerCase();
const isAllLower = s => s === s.toLowerCase() && s !== s.toUpperCase();

const titleCase = s =>
  s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map(w => (/^\s+$|^-$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');

/**
 * Pick the canonical spelling for a group of same-name-different-casing variants.
 * Prefer one that is already mixed case (properly cased); tie-break on the most common.
 */
function pickCanonical(variants, countsByVariant) {
  const properlyCased = variants.filter(v => !isAllUpper(v) && !isAllLower(v));
  const pool = properlyCased.length ? properlyCased : null;
  if (pool) {
    return pool.sort(
      (a, b) => (countsByVariant.get(b) ?? 0) - (countsByVariant.get(a) ?? 0),
    )[0];
  }
  // Everything is ALL-CAPS or all-lower — fall back to Title Case.
  return titleCase(variants[0]);
}

const client = new MongoClient(DB_URL);

try {
  await client.connect();
  const questions = client.db(DB_NAME).collection('questions');

  console.log(`\n${APPLY ? '🔧 APPLY' : '👀 DRY RUN'} — db: ${DB_NAME}\n`);

  let grandTotalDocs = 0;
  let grandTotalGroups = 0;

  for (const field of FIELDS) {
    // Group by the case-folded value so every spelling of one place lands together.
    const groups = await questions
      .aggregate([
        { $match: { [field]: { $type: 'string' } } },
        {
          $group: {
            _id: { $toLower: { $trim: { input: `$${field}` } } },
            variants: { $addToSet: `$${field}` },
            n: { $sum: 1 },
          },
        },
        { $match: { 'variants.1': { $exists: true } } }, // >1 spelling only
        { $sort: { n: -1 } },
      ])
      .toArray();

    const actionable = groups.filter(g => !SENTINELS.includes(g._id));

    console.log(`── ${field} — ${actionable.length} group(s) to normalise`);
    if (groups.length !== actionable.length) {
      console.log(
        `   (skipping ${groups.length - actionable.length} sentinel group(s): ${SENTINELS.join(', ')})`,
      );
    }

    for (const g of actionable) {
      // Per-variant counts, so the tie-break can prefer the more common spelling.
      const counts = await questions
        .aggregate([
          { $match: { [field]: { $in: g.variants } } },
          { $group: { _id: `$${field}`, n: { $sum: 1 } } },
        ])
        .toArray();
      const countsByVariant = new Map(counts.map(c => [c._id, c.n]));

      const canonical = pickCanonical(g.variants, countsByVariant);
      const stale = g.variants.filter(v => v !== canonical);
      if (!stale.length) continue;

      const affected = stale.reduce((s, v) => s + (countsByVariant.get(v) ?? 0), 0);
      grandTotalGroups += 1;
      grandTotalDocs += affected;

      console.log(
        `   ${stale.map(s => `"${s}"`).join(', ')}  →  "${canonical}"   (${affected} doc(s))`,
      );

      if (APPLY) {
        const res = await questions.updateMany(
          { [field]: { $in: stale } },
          { $set: { [field]: canonical } },
        );
        console.log(`      ✔ modified ${res.modifiedCount}`);
      }
    }
    console.log('');
  }

  console.log('==== Summary ====');
  console.log(`Groups needing normalisation : ${grandTotalGroups}`);
  console.log(`Documents ${APPLY ? 'updated' : 'that would change'} : ${grandTotalDocs}`);
  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to perform the update.');
  }
} catch (err) {
  console.error('❌ Failed:', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await client.close();
}
