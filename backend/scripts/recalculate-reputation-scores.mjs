#!/usr/bin/env node

/**
 * ============================================================================
 *  recalculate-reputation-scores.mjs
 * ============================================================================
 *
 *  Standalone script — run directly from the backend folder:
 *
 *      node scripts/recalculate-reputation-scores.mjs              # real run
 *      node scripts/recalculate-reputation-scores.mjs --dry-run    # preview only
 *
 *  What it does:
 *    1. Connects to MongoDB using DB_URL / DB_NAME from  backend/.env
 *    2. Fetches all expert users
 *    3. For EACH expert, recalculates `reputation_score` as:
 *         pendingSubmissions + pendingReroutes
 *
 *       — pendingSubmissions = count of question_submissions where:
 *           a) user is Author (queue[0] AND history is empty), OR
 *           b) user has an "in-review" entry in history[1..] (active reviewer)
 *         AND the linked question document still exists.
 *
 *       — pendingReroutes = count of reroute entries where:
 *           reroutes.reroutedTo = userId AND reroutes.status = "pending"
 *
 *    4. Updates the user document with the new score.
 *
 *  This matches the logic from the `fix/pending-workload-score` branch
 *  (recalculateReputationScore + getUserReviewLevel pipeline) exactly,
 *  but without any code changes to the running application.
 *
 *  Dependencies: mongodb, dotenv  (already in backend/package.json)
 * ============================================================================
 */

import { MongoClient, ObjectId } from 'mongodb';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env from backend/ ────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME;
const DRY_RUN = process.argv.includes('--dry-run');

if (!DB_URL || !DB_NAME) {
  console.error('❌  Missing DB_URL or DB_NAME in backend/.env');
  process.exit(1);
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   Reputation Score Recalculation Script                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`  Database : ${DB_NAME}`);
console.log(`  Mode     : ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '✏️  LIVE (will update DB)'}`);
console.log('');

// ── Connect ────────────────────────────────────────────────────────────────
const client = new MongoClient(DB_URL);

try {
  await client.connect();
  console.log('✅  Connected to MongoDB\n');

  const db = client.db(DB_NAME);
  const usersCol = db.collection('users');
  const submissionsCol = db.collection('question_submissions');
  const reroutesCol = db.collection('reroutes');

  // ── 1. Get all expert users ────────────────────────────────────────────
  const experts = await usersCol
    .find({ role: { $in: ['expert', 'pae_expert'] } })
    .project({ _id: 1, firstName: 1, lastName: 1, email: 1, reputation_score: 1 })
    .toArray();

  console.log(`📋  Found ${experts.length} expert(s) to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const changes = []; // for summary table

  // ── 2. For each expert, recalculate ────────────────────────────────────
  for (let i = 0; i < experts.length; i++) {
    const user = experts[i];
    const userId = user._id;
    const userObjectId = new ObjectId(userId);
    const userIdStr = userId.toString();
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

    try {
      // ────────────────────────────────────────────────────────────────────
      // Pending Submissions count
      // ────────────────────────────────────────────────────────────────────
      // Matches the recalculateReputationScore / getUserReviewLevel logic:
      //   - Author: queue[0] = userId AND history is empty
      //   - Level N reviewer: has an 'in-review' entry in history[1..]
      //   - Only if the linked question document still exists
      // ────────────────────────────────────────────────────────────────────
      const submissionAgg = await submissionsCol.aggregate([
        {
          $addFields: {
            historyArr: { $ifNull: ['$history', []] },
          },
        },
        {
          $addFields: {
            historyLen: { $size: '$historyArr' },
            historyExceptFirst: {
              $cond: [
                { $gt: [{ $size: '$historyArr' }, 1] },
                {
                  $slice: [
                    '$historyArr',
                    1,
                    { $subtract: [{ $size: '$historyArr' }, 1] },
                  ],
                },
                [],
              ],
            },
          },
        },
        {
          $addFields: {
            isAuthor: {
              $and: [
                { $eq: ['$historyLen', 0] },
                {
                  $or: [
                    { $eq: [{ $arrayElemAt: ['$queue', 0] }, userObjectId] },
                    { $eq: [{ $arrayElemAt: ['$queue', 0] }, userIdStr] },
                  ],
                },
              ],
            },
            hasInReviewEntry: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: '$historyExceptFirst',
                      as: 'h',
                      cond: {
                        $and: [
                          {
                            $or: [
                              { $eq: ['$$h.updatedBy', userObjectId] },
                              { $eq: ['$$h.updatedBy', userIdStr] },
                            ],
                          },
                          { $eq: ['$$h.status', 'in-review'] },
                        ],
                      },
                    },
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $match: {
            $or: [{ isAuthor: true }, { hasInReviewEntry: true }],
          },
        },
        // Join to questions — drops submissions whose question no longer exists
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'questionDetails',
          },
        },
        {
          $unwind: {
            path: '$questionDetails',
            preserveNullAndEmptyArrays: false,
          },
        },
        { $count: 'total' },
      ]).toArray();

      const submissionCount = submissionAgg[0]?.total ?? 0;

      // ────────────────────────────────────────────────────────────────────
      // Pending Reroutes count
      // ────────────────────────────────────────────────────────────────────
      // Each reroute doc has a nested reroutes[] array — unwind and match
      // on reroutes.reroutedTo = userId AND reroutes.status = 'pending'
      // ────────────────────────────────────────────────────────────────────
      const rerouteAgg = await reroutesCol.aggregate([
        { $unwind: '$reroutes' },
        {
          $match: {
            $or: [
              { 'reroutes.reroutedTo': userObjectId },
              { 'reroutes.reroutedTo': userIdStr },
            ],
            'reroutes.status': 'pending',
          },
        },
        { $count: 'total' },
      ]).toArray();

      const rerouteCount = rerouteAgg[0]?.total ?? 0;

      // ── New score ──────────────────────────────────────────────────────
      const newScore = submissionCount + rerouteCount;
      const oldScore = user.reputation_score ?? 0;

      if (newScore !== oldScore) {
        changes.push({
          name: userName,
          email: user.email,
          old: oldScore,
          new: newScore,
          submissions: submissionCount,
          reroutes: rerouteCount,
        });

        if (!DRY_RUN) {
          await usersCol.updateOne(
            { _id: userObjectId },
            { $set: { reputation_score: newScore, updatedAt: new Date() } },
          );
        }
        updated++;
      } else {
        skipped++;
      }

      // Progress
      if ((i + 1) % 10 === 0 || i === experts.length - 1) {
        process.stdout.write(
          `\r  Processing: ${i + 1}/${experts.length} (${updated} changed, ${skipped} unchanged)`,
        );
      }
    } catch (err) {
      errors++;
      console.error(`\n  ❌ Error for ${userName} (${userIdStr}): ${err.message}`);
    }
  }

  // ── 3. Summary ─────────────────────────────────────────────────────────
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total experts     : ${experts.length}`);
  console.log(`  Score changed     : ${updated}`);
  console.log(`  Already correct   : ${skipped}`);
  console.log(`  Errors            : ${errors}`);
  console.log('');

  if (changes.length > 0) {
    console.log(
      '  ┌─────────────────────────────────┬──────────────────────────────┬───────┬───────┬──────┬─────────┐',
    );
    console.log(
      '  │ Name                            │ Email                        │  Old  │  New  │ Subs │ Reroute │',
    );
    console.log(
      '  ├─────────────────────────────────┼──────────────────────────────┼───────┼───────┼──────┼─────────┤',
    );
    for (const c of changes) {
      const name = c.name.padEnd(31).slice(0, 31);
      const email = c.email.padEnd(28).slice(0, 28);
      const old = String(c.old).padStart(5);
      const nu = String(c.new).padStart(5);
      const subs = String(c.submissions).padStart(4);
      const rr = String(c.reroutes).padStart(7);
      console.log(`  │ ${name} │ ${email}   │ ${old} │ ${nu} │ ${subs} │ ${rr} │`);
    }
    console.log(
      '  └─────────────────────────────────┴──────────────────────────────┴───────┴───────┴──────┴─────────┘',
    );
  } else {
    console.log('  ✅  All reputation scores are already correct!');
  }

  console.log('');
  if (DRY_RUN && changes.length > 0) {
    console.log('  ⚠️   DRY RUN — no changes were written to the database.');
    console.log('  ➡️   Run without --dry-run to apply changes:');
    console.log('       node scripts/recalculate-reputation-scores.mjs');
  } else if (changes.length > 0) {
    console.log(`  ✅  ${updated} user(s) updated successfully.`);
  }
  console.log('');
} catch (err) {
  console.error('❌  Fatal error:', err);
  process.exit(1);
} finally {
  await client.close();
  console.log('🔒  MongoDB connection closed.');
}
