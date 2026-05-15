/**
 * One-time script: Sync corrected reputation_score for all users.
 *
 * This recalculates the pending workload for every user using the same
 * logic as getUserReviewLevel (the profile page Summary table), and writes
 * the corrected value back to users.reputation_score in MongoDB.
 *
 * Run after building:
 *   node build/scripts/syncReputationScores.js
 *
 * Or via npm script:
 *   pnpm run sync:reputation
 */

import 'reflect-metadata';
import { config } from 'dotenv';
import { MongoClient, ObjectId, Collection } from 'mongodb';

config(); // load .env

const MONGO_URI = process.env.DB_URL || process.env.MONGO_URI || process.env.DATABASE_URL || '';
const DB_NAME = process.env.DB_NAME || process.env.DATABASE_NAME || '';

if (!MONGO_URI || !DB_NAME) {
  console.error('❌  MONGO_URI and DB_NAME must be set in your .env file.');
  process.exit(1);
}

async function computePendingForUser(
  submissionsCol: Collection,
  reroutesCol: Collection,
  userId: ObjectId,
): Promise<number> {
  const userIdStr = userId.toString();

  // ── Submissions pending ──────────────────────────────────────────────────
  // Mirrors getUserReviewLevel pending pipeline exactly:
  //   Author  : history is empty AND user is at queue[0]
  //   Reviewer: user has an 'in-review' entry in history[1..]
  // Then joins to questions (preserveNullAndEmptyArrays: false) to drop
  // submissions whose question document no longer exists.
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
            { $slice: ['$historyArr', 1, { $subtract: [{ $size: '$historyArr' }, 1] }] },
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
                { $eq: [{ $arrayElemAt: ['$queue', 0] }, userId] },
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
                          { $eq: ['$$h.updatedBy', userId] },
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
    // Drop submissions whose question no longer exists
    {
      $lookup: {
        from: 'questions',
        localField: 'questionId',
        foreignField: '_id',
        as: 'questionDetails',
      },
    },
    { $unwind: { path: '$questionDetails', preserveNullAndEmptyArrays: false } },
    { $count: 'total' },
  ]).toArray();

  const submissionCount: number = (submissionAgg[0] as any)?.total ?? 0;

  // ── Reroutes pending ─────────────────────────────────────────────────────
  // The reroutes collection stores one doc per question with a nested
  // reroutes[] array. Must $unwind before matching on reroutes.reroutedTo.
  const rerouteAgg = await reroutesCol.aggregate([
    { $unwind: '$reroutes' },
    {
      $match: {
        $or: [
          { 'reroutes.reroutedTo': userId },
          { 'reroutes.reroutedTo': userIdStr },
        ],
        'reroutes.status': 'pending',
      },
    },
    { $count: 'total' },
  ]).toArray();

  const rerouteCount: number = (rerouteAgg[0] as any)?.total ?? 0;

  return submissionCount + rerouteCount;
}

async function main() {
  console.log('🔌  Connecting to MongoDB...');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const usersCol = db.collection('users');
  const submissionsCol = db.collection('question_submissions');
  const reroutesCol = db.collection('reroutes');

  // Fetch all users (experts, moderators, admins — cover everyone)
  const users = await usersCol.find({}, { projection: { _id: 1, role: 1, firstName: 1 } }).toArray();
  console.log(`👥  Found ${users.length} users. Starting sync...\n`);

  let updated = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const userId = user._id as ObjectId;
      const correctScore = await computePendingForUser(submissionsCol, reroutesCol, userId);

      await usersCol.updateOne(
        { _id: userId },
        { $set: { reputation_score: correctScore, updatedAt: new Date() } },
      );

      console.log(`  ✅  ${user.firstName ?? userId} (${user.role}) → reputation_score = ${correctScore}`);
      updated++;
    } catch (err: any) {
      console.error(`  ❌  Failed for user ${user._id}: ${err?.message}`);
      failed++;
    }
  }

  console.log(`\n🎉  Done. Updated: ${updated}, Failed: ${failed}`);
  await client.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
