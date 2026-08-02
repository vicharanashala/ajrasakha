/**
 * Clean up gate-keeper / auditor assignments on NON time-bound questions.
 *
 * Gate keepers and auditors only handle chatbot (AJRASAKHA / WHATSAPP) questions.
 * Earlier the cron assigned duplicate questions of any source, leaving gate keepers
 * "busy" holding AGRI_EXPERT / OUTREACH questions that will never be freed — which
 * blocks new chatbot assignments and makes "Allocated to gate keeper" show 0.
 *
 * This clears gateKeeperId/auditorId (+ assignedAt/finishedAt) on any question whose
 * source is NOT AJRASAKHA/WHATSAPP, and pulls those questionIds from every user's
 * assignedQuestionIds so the assignees become free again.
 *
 * SAFETY: dry-run by default. Pass --apply to write.
 *
 * Usage:
 *   node scripts/cleanup-nonchatbot-role-assignees.js          # dry run
 *   node scripts/cleanup-nonchatbot-role-assignees.js --apply  # perform cleanup
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set.');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const CHATBOT = ['AJRASAKHA', 'WHATSAPP'];

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');
  const users = db.collection('users');

  // Questions assigned to a gate keeper or auditor whose source is NOT chatbot.
  const filter = {
    source: { $nin: CHATBOT },
    $or: [
      { gateKeeperId: { $ne: null, $exists: true } },
      { auditorId: { $ne: null, $exists: true } },
    ],
  };
  const docs = await questions
    .find(filter, {
      projection: { _id: 1, source: 1, status: 1, gateKeeperId: 1, auditorId: 1 },
    })
    .toArray();

  console.log('========== Cleanup non-chatbot role assignees ==========');
  console.log(`DB: ${DB_NAME}`);
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (pass --apply)'}`);
  console.log(`Non-chatbot questions with a gate keeper / auditor: ${docs.length}`);

  let gkCleared = 0;
  let audCleared = 0;
  const affectedUserIds = new Set();

  for (const d of docs) {
    if (d.gateKeeperId) {
      gkCleared++;
      affectedUserIds.add(d.gateKeeperId.toString());
    }
    if (d.auditorId) {
      audCleared++;
      affectedUserIds.add(d.auditorId.toString());
    }
    console.log(
      `  q=${d._id.toString().slice(-6)} source=${d.source} status=${d.status} ` +
        `gk=${d.gateKeeperId ? d.gateKeeperId.toString().slice(-6) : '-'} ` +
        `aud=${d.auditorId ? d.auditorId.toString().slice(-6) : '-'}`,
    );
  }
  console.log(`  gate-keeper assignments to clear : ${gkCleared}`);
  console.log(`  auditor assignments to clear     : ${audCleared}`);
  console.log(`  distinct users to free            : ${affectedUserIds.size}`);
  console.log('========================================================');

  if (!docs.length) {
    console.log('\nNothing to clean up.');
  } else if (!APPLY) {
    console.log('\nDry run — re-run with --apply to perform the cleanup.');
  } else {
    const ids = docs.map((d) => d._id);

    // 1. Clear the assignee fields on the questions.
    const res = await questions.updateMany(
      { _id: { $in: ids } },
      {
        $set: { updatedAt: new Date() },
        $unset: {
          gateKeeperId: '',
          gateKeeperAssignedAt: '',
          gateKeeperFinishedAt: '',
          auditorId: '',
          auditorAssignedAt: '',
          auditorFinishedAt: '',
        },
      },
    );

    // 2. Pull those questionIds from every user's assignedQuestionIds so they're free.
    const userRes = await users.updateMany(
      { 'assignedQuestionIds.questionId': { $in: ids } },
      { $pull: { assignedQuestionIds: { questionId: { $in: ids } } } },
    );

    console.log(
      `\n✅ Cleared ${res.modifiedCount} question(s); freed entries on ${userRes.modifiedCount} user(s).`,
    );
  }
} catch (err) {
  console.error('❌ Cleanup failed:', err);
  process.exitCode = 1;
} finally {
  await client.close();
}
