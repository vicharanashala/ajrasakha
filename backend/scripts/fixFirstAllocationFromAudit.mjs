/**
 * Fixes questions whose firstAllocationAt was overwritten to a later time (so that
 * firstAllocationAt > history[0].createdAt — a negative time-to-first-response).
 *
 * For each such question it finds the allocation audit for the head-of-queue expert
 * (queue[0]) — either SYSTEM_ALLOCATED (context.expertId, auto-allocate) or SELECT_EXPERT
 * (changes.after.expertsDetails[].id, manual pick) — and sets
 *   question.firstAllocationAt = that audit's createdAt
 * i.e. the TRUE first-allocation time of the head expert.
 *
 * Detection logic mirrors findNegativeFirstAllocation.mjs (that script is read-only and is
 * NOT modified). This one WRITES, so it is a DRY RUN by default — pass --apply to update.
 *
 * Run from the backend dir:
 *   node scripts/fixFirstAllocationFromAudit.mjs            # dry run: show what would change
 *   node scripts/fixFirstAllocationFromAudit.mjs --apply    # actually update firstAllocationAt
 *   node scripts/fixFirstAllocationFromAudit.mjs --limit 20 # cap rows processed/printed
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.DB_URL;
const dbName = 'agriai';

if (!uri || !dbName) {
  console.error('Missing DB_URL or DB_NAME in the environment (.env).');
  process.exit(1);
}

const args = process.argv.slice(2);
const doApply = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) || 0 : 0;

const client = new MongoClient(uri, {
  ssl: true,
  tls: true,
  retryWrites: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
});

const fmt = d => (d ? new Date(d).toISOString() : 'null');

try {
  await client.connect();
  const db = client.db(dbName);

  // 1) Find the anomalies (firstAllocationAt > history[0].createdAt) — same pipeline as the
  //    read-only finder. See findNegativeFirstAllocation.mjs for notes on the gotchas.
  let rows = await db
    .collection('question_submissions')
    .aggregate(
      [
        { $match: { 'history.0.createdAt': { $exists: true } } },
        {
          $addFields: {
            firstHistoryCreatedAt: { $arrayElemAt: ['$history.createdAt', 0] },
            queue0: { $arrayElemAt: ['$queue', 0] },
          },
        },
        {
          $lookup: { from: 'questions', localField: 'questionId', foreignField: '_id', as: 'q' },
        },
        { $addFields: { q: { $arrayElemAt: ['$q', 0] } } },
        { $match: { 'q.firstAllocationAt': { $exists: true } } },
        {
          $addFields: {
            _fa: { $convert: { input: '$q.firstAllocationAt', to: 'date', onError: null, onNull: null } },
            _fh: { $convert: { input: '$firstHistoryCreatedAt', to: 'date', onError: null, onNull: null } },
          },
        },
        { $match: { _fa: { $ne: null }, _fh: { $ne: null } } },
        { $addFields: { diffMs: { $subtract: ['$_fh', '$_fa'] } } },
        { $match: { diffMs: { $lt: 0 } } },
        { $sort: { diffMs: 1 } },
        {
          $project: {
            _id: 0,
            questionId: '$questionId',
            firstAllocationAt: '$_fa',
            firstHistoryCreatedAt: '$_fh',
            queue0: '$queue0',
            diffMs: 1,
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  if (limit > 0) rows = rows.slice(0, limit);

  // 2) Load the allocation audits (SELECT_EXPERT + SYSTEM_ALLOCATED) for these questions.
  const qids = [...new Set(rows.map(r => String(r.questionId)))];
  const qidObjs = qids
    .map(s => { try { return new ObjectId(s); } catch { return null; } })
    .filter(Boolean);
  const qidMatch = [...qids, ...qidObjs];
  const auditDocs = qids.length
    ? await db
        .collection('auditTrails')
        .aggregate([
          {
            $match: {
              action: { $in: ['SELECT_EXPERT', 'SYSTEM_ALLOCATED'] },
              'context.questionId': { $in: qidMatch },
            },
          },
          { $unwind: '$context.questionId' },
          { $match: { 'context.questionId': { $in: qidMatch } } },
          {
            $project: {
              _id: 0,
              qid: '$context.questionId',
              action: '$action',
              createdAt: { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } },
              expertsDetailsIds: '$changes.after.expertsDetails.id',
              expertId: '$context.expertId',
            },
          },
        ])
        .toArray()
    : [];
  const allocByQid = new Map();
  for (const d of auditDocs) {
    const key = String(d.qid);
    const ids = [
      ...(Array.isArray(d.expertsDetailsIds) ? d.expertsDetailsIds : d.expertsDetailsIds ? [d.expertsDetailsIds] : []),
      ...(Array.isArray(d.expertId) ? d.expertId : d.expertId ? [d.expertId] : []),
    ].map(String);
    if (!allocByQid.has(key)) allocByQid.set(key, []);
    allocByQid.get(key).push({ action: d.action, createdAt: d.createdAt, expertIds: ids });
  }

  // 3) Resolve the corrected firstAllocationAt = earliest queue[0] allocation audit createdAt.
  const updates = [];
  const skipped = [];
  for (const r of rows) {
    const q0 = r.queue0 ? String(r.queue0) : null;
    const audits = allocByQid.get(String(r.questionId)) || [];
    const matching = q0 ? audits.filter(a => a.createdAt && a.expertIds.includes(q0)) : [];
    const earliest = matching
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

    if (!earliest) {
      skipped.push({ ...r, reason: 'no SELECT_EXPERT/SYSTEM_ALLOCATED audit for queue[0]' });
      continue;
    }
    const newVal = new Date(earliest.createdAt);
    // Safety: only apply a value that actually fixes the anomaly (allocation <= first answer)
    // and is genuinely earlier than the stored value.
    if (newVal.getTime() > new Date(r.firstHistoryCreatedAt).getTime()) {
      skipped.push({ ...r, reason: `audit createdAt (${fmt(newVal)}) still after history[0]` });
      continue;
    }
    if (newVal.getTime() >= new Date(r.firstAllocationAt).getTime()) {
      skipped.push({ ...r, reason: 'audit createdAt not earlier than current firstAllocationAt' });
      continue;
    }
    updates.push({
      questionId: r.questionId,
      from: r.firstAllocationAt,
      to: newVal,
      action: earliest.action,
    });
  }

  console.log(`\n${doApply ? 'APPLY' : 'DRY RUN'} — ${rows.length} anomaly question(s); ${updates.length} to fix, ${skipped.length} skipped.\n`);
  for (const u of updates) {
    console.log(`  ${u.questionId}  firstAllocationAt: ${fmt(u.from)}  ->  ${fmt(u.to)}  [${u.action}]`);
  }
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const s of skipped) {
      console.log(`  ${s.questionId}  (${s.reason})`);
    }
  }

  if (!doApply) {
    console.log('\nDry run only — no documents changed. Re-run with --apply to write these updates.');
  } else if (updates.length) {
    const ops = updates.map(u => ({
      updateOne: {
        filter: { _id: new ObjectId(String(u.questionId)) },
        update: { $set: { firstAllocationAt: u.to } },
      },
    }));
    const res = await db.collection('questions').bulkWrite(ops, { ordered: false });
    console.log(`\nApplied. matched=${res.matchedCount} modified=${res.modifiedCount}`);
  } else {
    console.log('\nNothing to apply.');
  }
} catch (err) {
  console.error('Script failed:', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await client.close();
}
