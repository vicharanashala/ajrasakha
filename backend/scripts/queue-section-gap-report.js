/**
 * Diagnostic: which auto-allocate (time-bound) open/delayed questions are NOT
 * captured by any of the actionable queue sections (allocated / needsReviewer /
 * waiting)?  Read-only — prints the "missed" documents and a likely reason.
 *
 * Universe (mirrors getQueueQuestionSection 'autoOff'):
 *   source in [AJRASAKHA, WHATSAPP], isAutoAllocate: true, status in [open, delayed]
 *
 * Covered = allocated  ∪  needsReviewer  ∪  waiting   (exact section queries).
 * Missed  = Universe − Covered.
 *
 * Usage:  node scripts/queue-section-gap-report.js
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

const SRC = { $in: ['AJRASAKHA', 'WHATSAPP'] };
const OPEN = { $in: ['open', 'delayed'] };

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');
  const submissions = db.collection('question_submissions');

  // ---- Universe: all auto-allocate open/delayed time-bound questions ----
  const universe = await questions
    .find(
      { source: SRC, isAutoAllocate: true, status: OPEN },
      { projection: { _id: 1, question: 1, status: 1, isOnHold: 1, firstAllocationAt: 1, createdAt: 1 } },
    )
    .toArray();

  // ---- allocated: queue not empty + last history entry carries no answer ----
  const allocated = await questions
    .aggregate([
      { $match: { source: SRC, isAutoAllocate: true, status: OPEN } },
      { $lookup: { from: 'question_submissions', localField: '_id', foreignField: 'questionId', as: 'sub' } },
      { $addFields: { sub: { $arrayElemAt: ['$sub', 0] } } },
      { $match: { 'sub.queue.0': { $exists: true } } },
      { $addFields: { lastHistory: { $arrayElemAt: [{ $ifNull: ['$sub.history', []] }, -1] } } },
      {
        $match: {
          'lastHistory.answer': { $in: [null] },
          'lastHistory.approvedAnswer': { $in: [null] },
          'lastHistory.modifiedAnswer': { $in: [null] },
          'lastHistory.rejectedAnswer': { $in: [null] },
        },
      },
      { $project: { _id: 1 } },
    ])
    .toArray();

  // ---- needsReviewer: everyone in queue acted + last entry is "completed" ----
  const needsReviewer = await submissions
    .aggregate([
      {
        $addFields: {
          histLen: { $size: { $ifNull: ['$history', []] } },
          queueLen: { $size: { $ifNull: ['$queue', []] } },
          lastHistory: { $arrayElemAt: ['$history', -1] },
        },
      },
      {
        $match: {
          queueLen: { $gt: 0 },
          $expr: { $gte: ['$histLen', '$queueLen'] },
          $or: [
            { $and: [{ queueLen: 1 }, { 'lastHistory.answer': { $exists: true, $ne: null } }] },
            { $and: [{ queueLen: { $gt: 1 } }, { 'lastHistory.status': { $nin: ['in-review'] } }] },
          ],
        },
      },
      { $lookup: { from: 'questions', localField: 'questionId', foreignField: '_id', as: 'question' } },
      { $unwind: '$question' },
      {
        $match: {
          'question.source': SRC,
          'question.status': OPEN,
          'question.isOnHold': { $ne: true },
          'question.isAutoAllocate': { $eq: true },
        },
      },
      { $project: { _id: '$question._id' } },
    ])
    .toArray();

  // ---- waiting: never allocated (firstAllocationAt absent or null) ----
  const waiting = await questions
    .find(
      { source: SRC, isAutoAllocate: true, status: OPEN, firstAllocationAt: null, isOnHold: { $ne: true } },
      { projection: { _id: 1 } },
    )
    .toArray();

  const idSet = (arr, key = '_id') => new Set(arr.map(d => d[key].toString()));
  const allocatedIds = idSet(allocated);
  const needsReviewerIds = idSet(needsReviewer);
  const waitingIds = idSet(waiting);
  const covered = new Set([...allocatedIds, ...needsReviewerIds, ...waitingIds]);

  const missed = universe.filter(q => !covered.has(q._id.toString()));

  console.log(`DB: ${DB_NAME}`);
  console.log('--- section counts ---');
  console.log(`  universe (autoOff):  ${universe.length}`);
  console.log(`  allocated:           ${allocatedIds.size}`);
  console.log(`  needsReviewer:       ${needsReviewerIds.size}`);
  console.log(`  waiting:             ${waitingIds.size}`);
  console.log(`  covered (union):     ${covered.size}`);
  console.log(`  MISSED:              ${missed.length}\n`);

  if (!missed.length) {
    console.log('✅ No missed documents — every auto-allocate open/delayed question is in a section.');
  } else {
    // Pull submission shape for each missed doc to explain WHY it falls through.
    const missedIds = missed.map(m => m._id);
    const subs = await submissions
      .find({ questionId: { $in: missedIds } }, { projection: { questionId: 1, queue: 1, history: 1, currentExpertOpenedAt: 1, currentExpertAllocatedAt: 1 } })
      .toArray();
    const subByQ = new Map(subs.map(s => [s.questionId.toString(), s]));

    for (const q of missed) {
      const s = subByQ.get(q._id.toString());
      const qLen = s?.queue?.length ?? 0;
      const hLen = s?.history?.length ?? 0;
      let reason;
      if (!s) reason = 'NO submission document';
      else if (q.isOnHold) reason = 'on hold';
      else if (qLen === 0) reason = 'queue empty but firstAllocationAt set (allocated-then-emptied; not "waiting")';
      else if (hLen < qLen) reason = `history(${hLen}) < queue(${qLen}) — mid-review, last entry has an answer (not "allocated")`;
      else reason = `queue(${qLen})/history(${hLen}) — likely in stuck/openedIdle bucket only`;

      console.log(
        `  ${q._id}  [${q.status}]  q="${(q.question || '').slice(0, 50)}"  ` +
          `firstAlloc=${q.firstAllocationAt ? 'yes' : 'no'}  queue=${qLen} hist=${hLen}  → ${reason}`,
      );
    }
  }
} catch (err) {
  console.error('❌ Script failed:', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await client.close();
}
