/**
 * Finds questions whose firstAllocationAt is LATER than the first submission history
 * entry (history[0].createdAt) — i.e. the "time to first response"
 * (history[0].createdAt − firstAllocationAt) is NEGATIVE.
 *
 * These are data anomalies: a question can't be first-answered before it was first
 * allocated. (Typically caused by firstAllocationAt being overwritten to a later time
 * during a reallocation.)
 *
 * Each anomaly is enriched with the audit that allocated its head-of-queue expert
 * (queue[0]) — either SELECT_EXPERT (changes.after.expertsDetails[].id, manual pick) or
 * SYSTEM_ALLOCATED (context.expertId, auto-allocate) — and that audit's createdAt (the
 * TRUE first-allocation time). It also reports the allocation audit closest to
 * firstAllocationAt (the event that overwrote it). Questions with no matching allocation
 * audit for queue[0] are listed separately.
 *
 * Reads DB_URL / DB_NAME from backend/.env (same as the app).
 *
 * Run from the backend dir:
 *   node scripts/findNegativeFirstAllocation.mjs
 *   node scripts/findNegativeFirstAllocation.mjs --csv          # also write a CSV
 *   node scripts/findNegativeFirstAllocation.mjs --limit 100    # cap rows printed
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { writeFileSync } from 'node:fs';

const uri = process.env.DB_URL;
const dbName = 'agriai';

if (!uri || !dbName) {
  console.error('Missing DB_URL or DB_NAME in the environment (.env).');
  process.exit(1);
}

const args = process.argv.slice(2);
const wantCsv = args.includes('--csv');
const limitIdx = args.indexOf('--limit');
const printLimit = limitIdx !== -1 ? Number(args[limitIdx + 1]) || 0 : 0;

const client = new MongoClient(uri, {
  ssl: true,
  tls: true,
  retryWrites: true,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
});

const fmt = d => (d ? new Date(d).toISOString() : 'null');
const ms = n => {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const s = Math.floor(a / 1000) % 60;
  const m = Math.floor(a / 60000) % 60;
  const h = Math.floor(a / 3600000);
  return `${sign}${h}h ${m}m ${s}s`;
};

try {
  await client.connect();
  const db = client.db(dbName);

  const rows = await db
    .collection('question_submissions')
    .aggregate(
      [
        // Only submissions that have a first history entry with a timestamp.
        // NOTE: $ne:null on a positional array path (history.0.createdAt) silently
        // matches nothing in MongoDB, so use $exists only; a missing/null timestamp
        // yields diffMs=null below, which is excluded by the final diffMs<0 filter.
        { $match: { 'history.0.createdAt': { $exists: true } } },
        {
          $addFields: {
            firstHistoryCreatedAt: { $arrayElemAt: ['$history.createdAt', 0] },
            firstHistoryUpdatedBy: { $arrayElemAt: ['$history.updatedBy', 0] },
            queue0: { $arrayElemAt: ['$queue', 0] },
          },
        },
        // Join the question to read firstAllocationAt.
        {
          $lookup: {
            from: 'questions',
            localField: 'questionId',
            foreignField: '_id',
            as: 'q',
          },
        },
        { $addFields: { q: { $arrayElemAt: ['$q', 0] } } },
        { $match: { 'q.firstAllocationAt': { $exists: true } } },
        // Coerce to Date (some docs store these as ISO strings) — non-convertible → null.
        {
          $addFields: {
            _fa: { $convert: { input: '$q.firstAllocationAt', to: 'date', onError: null, onNull: null } },
            _fh: { $convert: { input: '$firstHistoryCreatedAt', to: 'date', onError: null, onNull: null } },
          },
        },
        { $match: { _fa: { $ne: null }, _fh: { $ne: null } } },
        {
          $addFields: {
            // time to first response (should be >= 0); negative = anomaly.
            diffMs: { $subtract: ['$_fh', '$_fa'] },
          },
        },
        { $match: { diffMs: { $lt: 0 } } },
        { $sort: { diffMs: 1 } }, // most negative (worst) first
        {
          $project: {
            _id: 0,
            questionId: '$questionId',
            question: '$q.question',
            status: '$q.status',
            source: '$q.source',
            firstAllocationAt: '$_fa',
            firstHistoryCreatedAt: '$_fh',
            firstHistoryUpdatedBy: '$firstHistoryUpdatedBy',
            queue0: '$queue0',
            diffMs: 1,
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  // Enrich each anomalous question with the allocation audit that allocated its
  // head-of-queue expert (queue[0]). Allocation shows up under two actions:
  //   SELECT_EXPERT   → expert id(s) in changes.after.expertsDetails[].id (manual pick)
  //   SYSTEM_ALLOCATED→ single expert id in context.expertId (auto-allocate)
  // We match the audit whose expert id equals queue[0] and take its createdAt.
  // context.questionId is an ARRAY (of ObjectIds or strings) so we unwind + match both forms.
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
              // SELECT_EXPERT: array of string ids. SYSTEM_ALLOCATED: single string id.
              expertsDetailsIds: '$changes.after.expertsDetails.id',
              expertId: '$context.expertId',
            },
          },
        ])
        .toArray()
    : [];
  // Group allocation audits by question id, normalising the expert id(s) to a string array.
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

  for (const r of rows) {
    const q0 = r.queue0 ? String(r.queue0) : null;
    r.queue0Id = q0;
    const audits = allocByQid.get(String(r.questionId)) || [];
    // The allocation audit(s) (SELECT_EXPERT or SYSTEM_ALLOCATED) for the head-of-queue expert.
    const matching = q0 ? audits.filter(a => a.expertIds.includes(q0)) : [];
    // Earliest allocation of queue[0] — the TRUE first-allocation time firstAllocationAt should hold.
    const earliest = matching
      .filter(a => a.createdAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    r.allocAt = earliest?.createdAt ?? null;
    r.allocAction = earliest?.action ?? null;
    r.allocCount = matching.length;
    // allocAt vs firstAllocationAt (how far firstAllocationAt drifted from the real allocation).
    r.allocVsFirstAllocMs =
      r.allocAt && r.firstAllocationAt
        ? new Date(r.allocAt).getTime() - new Date(r.firstAllocationAt).getTime()
        : null;
    // allocAt vs history[0].createdAt (should be >= 0: allocated before the first answer).
    r.allocVsHistory0Ms =
      r.allocAt && r.firstHistoryCreatedAt
        ? new Date(r.allocAt).getTime() - new Date(r.firstHistoryCreatedAt).getTime()
        : null;

    // Diagnostic: the allocation audit (for ANY expert) whose createdAt is closest to
    // firstAllocationAt — reveals which event overwrote firstAllocationAt (usually a
    // later SELECT_EXPERT for a different expert).
    const faTime = r.firstAllocationAt ? new Date(r.firstAllocationAt).getTime() : null;
    let nearest = null;
    if (faTime != null) {
      for (const a of audits) {
        if (!a.createdAt) continue;
        const d = Math.abs(new Date(a.createdAt).getTime() - faTime);
        if (!nearest || d < nearest.d) nearest = { d, at: a.createdAt, action: a.action, expertIds: a.expertIds };
      }
    }
    r.nearestSelectAt = nearest?.at ?? null;
    r.nearestSelectAction = nearest?.action ?? null;
    r.nearestSelectExpertIds = nearest?.expertIds ?? [];
    r.nearestSelectVsAllocMs =
      nearest && faTime != null ? new Date(nearest.at).getTime() - faTime : null;
  }
  const noAudit = rows.filter(r => !r.allocAt);

  console.log(`\nFound ${rows.length} question(s) where firstAllocationAt is later than history[0].createdAt (negative time-to-first-response).\n`);

  const toShow = printLimit > 0 ? rows.slice(0, printLimit) : rows;
  for (const r of toShow) {
    const allocCol = r.allocAt
      ? `queue0AllocatedAt=${fmt(r.allocAt)} [${r.allocAction}] (vs-firstAlloc=${ms(r.allocVsFirstAllocMs)}, vs-history[0]=${ms(r.allocVsHistory0Ms)})`
      : `queue0AllocatedAt=NONE`;
    const nearCol = r.nearestSelectAt
      ? `overwriteBy=${fmt(r.nearestSelectAt)} [${r.nearestSelectAction}] (Δalloc=${ms(r.nearestSelectVsAllocMs)}, expert=${r.nearestSelectExpertIds.join('|') || '?'})`
      : `overwriteBy=NONE`;
    console.log(
      `${r.questionId}  diff=${ms(r.diffMs)}  firstAllocationAt=${fmt(r.firstAllocationAt)}  history[0].createdAt=${fmt(r.firstHistoryCreatedAt)}  queue[0]=${r.queue0Id ?? 'none'}  ${allocCol}  ${nearCol}  [${r.source}/${r.status}]  ${String(r.question ?? '').slice(0, 70)}`,
    );
  }
  if (printLimit > 0 && rows.length > printLimit) {
    console.log(`… ${rows.length - printLimit} more (raise --limit or use --csv).`);
  }

  // Separate list: anomalous questions with NO allocation audit (SELECT_EXPERT / SYSTEM_ALLOCATED) for queue[0].
  console.log(`\n${noAudit.length} of them have NO SELECT_EXPERT/SYSTEM_ALLOCATED audit matching queue[0]:`);
  for (const r of noAudit) {
    console.log(`  ${r.questionId}  queue[0]=${r.queue0Id ?? 'none'}  [${r.source}/${r.status}]  ${String(r.question ?? '').slice(0, 70)}`);
  }

  if (wantCsv && rows.length) {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      'questionId,queue0Id,firstAllocationAt,firstHistoryCreatedAt,diffMs,diffHuman,queue0AllocatedAt,allocAction,allocCount,allocVsFirstAllocMs,allocVsFirstAllocHuman,allocVsHistory0Ms,allocVsHistory0Human,overwriteAt,overwriteAction,overwriteExpertIds,overwriteVsFirstAllocMs,overwriteVsFirstAllocHuman,source,status,question',
      ...rows.map(r =>
        [
          r.questionId,
          r.queue0Id ?? '',
          fmt(r.firstAllocationAt),
          fmt(r.firstHistoryCreatedAt),
          r.diffMs,
          ms(r.diffMs),
          r.allocAt ? fmt(r.allocAt) : '',
          r.allocAction ?? '',
          r.allocCount,
          r.allocVsFirstAllocMs ?? '',
          r.allocVsFirstAllocMs != null ? ms(r.allocVsFirstAllocMs) : '',
          r.allocVsHistory0Ms ?? '',
          r.allocVsHistory0Ms != null ? ms(r.allocVsHistory0Ms) : '',
          r.nearestSelectAt ? fmt(r.nearestSelectAt) : '',
          r.nearestSelectAction ?? '',
          esc((r.nearestSelectExpertIds || []).join('|')),
          r.nearestSelectVsAllocMs ?? '',
          r.nearestSelectVsAllocMs != null ? ms(r.nearestSelectVsAllocMs) : '',
          r.source,
          r.status,
          esc(r.question),
        ].join(','),
      ),
    ].join('\n');
    const out = `negative_first_allocation_${Date.now()}.csv`;
    writeFileSync(out, csv, 'utf8');
    console.log(`\nWrote ${rows.length} rows to ${out}`);

    if (noAudit.length) {
      const csvNo = [
        'questionId,queue0Id,firstAllocationAt,firstHistoryCreatedAt,diffMs,diffHuman,source,status,question',
        ...noAudit.map(r =>
          [
            r.questionId,
            r.queue0Id ?? '',
            fmt(r.firstAllocationAt),
            fmt(r.firstHistoryCreatedAt),
            r.diffMs,
            ms(r.diffMs),
            r.source,
            r.status,
            esc(r.question),
          ].join(','),
        ),
      ].join('\n');
      const outNo = `no_select_expert_audit_${Date.now()}.csv`;
      writeFileSync(outNo, csvNo, 'utf8');
      console.log(`Wrote ${noAudit.length} no-audit rows to ${outNo}`);
    }
  }
} catch (err) {
  console.error('Script failed:', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await client.close();
}
