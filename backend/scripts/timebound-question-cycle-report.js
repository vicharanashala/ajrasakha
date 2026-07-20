/**
 * Time-bound question lifecycle report → Excel.
 *
 * For every TIME-BOUND question created in a date window (default: the last 7 days),
 * emits one row: the author, each reviewer and the moderator, with the time each of them
 * took, plus the question's total lifecycle time.
 *
 * "Time-bound" mirrors the app's own definition (models.ts TIME_BOUND_SOURCES):
 *   source in [AJRASAKHA, WHATSAPP]  AND  isAutoAllocate: true
 *
 * Timings come from question_submissions.history, which is the work log:
 *   • history[0]  is the author  → time = question.firstAllocationAt → entry.createdAt
 *   • history[1..] are reviewers → time = entry.createdAt → entry.updatedAt
 *   • moderator                  → time = question.moderatorAssignedAt → closedAt
 *   • total                      → question.createdAt → closedAt
 *
 * All timestamps are written in IST (UTC+5:30), and --from/--to are IST calendar days.
 *
 * Usage:
 *   node scripts/timebound-question-cycle-report.js                  # last 7 days
 *   node scripts/timebound-question-cycle-report.js --days=30
 *   node scripts/timebound-question-cycle-report.js --from=2026-07-01 --to=2026-07-15
 *   node scripts/timebound-question-cycle-report.js --closed-only
 *   node scripts/timebound-question-cycle-report.js --all-sources    # drop the time-bound filter
 *   node scripts/timebound-question-cycle-report.js --max-reviewers=3  # cap reviewer columns
 *   node scripts/timebound-question-cycle-report.js --out=report.xlsx
 *
 * Read-only. Reads DB_URL / DB_NAME from the environment (.env is auto-loaded).
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import path from 'node:path';

/* ─────────────────────────────── args ─────────────────────────────── */

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const hasFlag = name => args.includes(`--${name}`);

const DAYS = Number(argVal('days', 7));
const FROM = argVal('from', null);
const TO = argVal('to', null);
const CLOSED_ONLY = hasFlag('closed-only');
const ALL_SOURCES = hasFlag('all-sources');
const OUT = argVal(
  'out',
  `timebound-question-cycle-${new Date().toISOString().slice(0, 10)}.xlsx`,
);

// Window: explicit --from/--to wins, else the trailing N days ending now.
// Dates are interpreted as IST calendar days (+05:30), so --from=2026-07-18 means that
// whole day as the team experiences it, not the UTC day.
const to = TO ? new Date(`${TO}T23:59:59.999+05:30`) : new Date();
const from = FROM
  ? new Date(`${FROM}T00:00:00.000+05:30`)
  : new Date(to.getTime() - DAYS * 24 * 60 * 60 * 1000);

if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
  console.error('❌ Invalid --from/--to. Use YYYY-MM-DD.');
  process.exit(1);
}

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

const TIME_BOUND_SOURCES = ['AJRASAKHA', 'WHATSAPP'];
const CLOSED_STATUSES = ['closed', 'dynamic_closed', 'duplicate_closed'];

const asDate = v => (v ? new Date(v) : null);

/** Mongo stores UTC; the team reads IST (UTC+5:30). */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Excel cells carry no timezone — a date cell is just wall-clock text. So shift the
 * instant by +5:30 and the cell reads as IST. Durations are unaffected (a difference
 * between two instants is timezone-independent).
 */
const asIST = v => {
  const d = asDate(v);
  return d && !Number.isNaN(d.getTime()) ? new Date(d.getTime() + IST_OFFSET_MS) : null;
};

/** Human-readable IST stamp for console output. */
const istLabel = d =>
  d ? `${new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')} IST` : '';

/**
 * Elapsed hours between two timestamps. Null when either is missing.
 * Deliberately unrounded — rounding to 2dp here is 0.6-minute granularity, which visibly
 * skews short handling times and makes sums drift. Rounding happens once, at display.
 */
const hoursBetween = (start, end) => {
  const a = asDate(start);
  const b = asDate(end);
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return (b - a) / 36e5;
};

/** "3d 4h 12m" — a human-readable companion to the raw hours column. */
const humanDuration = hours => {
  if (hours === null) return '';
  const totalMin = Math.round(hours * 60);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
};

const idStr = v => (v ? v.toString() : '');

const oid = v => {
  const s = idStr(v);
  return s && ObjectId.isValid(s) ? new ObjectId(s) : null;
};

/* ─────────────────────────────── run ─────────────────────────────── */

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');
  const submissions = db.collection('question_submissions');
  const answers = db.collection('answers');
  const usersCol = db.collection('users');

  const match = {
    createdAt: { $gte: from, $lte: to },
    isTesting: { $ne: true },
    ...(ALL_SOURCES
      ? {}
      : { source: { $in: TIME_BOUND_SOURCES }, isAutoAllocate: true }),
    ...(CLOSED_ONLY ? { status: { $in: CLOSED_STATUSES } } : {}),
  };

  console.log(
    `\n📅 Window : ${istLabel(from)} → ${istLabel(to)}` +
      `\n🎯 Scope  : ${ALL_SOURCES ? 'ALL sources' : 'time-bound (AJRASAKHA/WHATSAPP + isAutoAllocate)'}` +
      `${CLOSED_ONLY ? ' · closed only' : ''}`,
  );

  const docs = await questions.find(match).sort({ createdAt: 1 }).toArray();
  console.log(`📦 Questions found: ${docs.length}`);

  if (docs.length === 0) {
    console.log('Nothing to export — no questions matched. Exiting without writing a file.');
    process.exit(0);
  }

  const qIds = docs.map(q => q._id);

  // ---- Related data, fetched in bulk (not per-question) ----
  const [subs, ans] = await Promise.all([
    submissions.find({ questionId: { $in: qIds } }).toArray(),
    answers.find({ questionId: { $in: qIds } }).toArray(),
  ]);

  const subByQ = new Map(subs.map(s => [idStr(s.questionId), s]));
  const ansByQ = new Map();
  for (const a of ans) {
    const k = idStr(a.questionId);
    if (!ansByQ.has(k)) ansByQ.set(k, []);
    ansByQ.get(k).push(a);
  }

  // ---- Resolve every referenced user in one go ----
  const userIds = new Set();
  const collect = v => {
    const o = oid(v);
    if (o) userIds.add(o.toString());
  };
  for (const q of docs) {
    collect(q.userId);
    collect(q.moderatorId);
    collect(q.gateKeeperId);
    collect(q.auditorId);
    const s = subByQ.get(idStr(q._id));
    if (s) {
      collect(s.lastRespondedBy);
      (s.queue ?? []).forEach(collect);
    }
    (ansByQ.get(idStr(q._id)) ?? []).forEach(a => {
      collect(a.authorId);
      collect(a.approvedBy);
    });
    // Author + reviewers both come from the submission history's updatedBy.
    (s?.history ?? []).forEach(h => collect(h.updatedBy));
  }
  const users = await usersCol
    .find({ _id: { $in: [...userIds].map(id => new ObjectId(id)) } })
    // email is fetched only as a display fallback for users with no name on record.
    .project({ firstName: 1, lastName: 1, email: 1 })
    .toArray();
  const userById = new Map(users.map(u => [idStr(u._id), u]));

  const nameOf = v => {
    const u = userById.get(idStr(v));
    if (!u) return '';
    return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || '';
  };

  /**
   * What the reviewer did, read straight off their history entry: exactly one of
   * approvedAnswer / modifiedAnswer / rejectedAnswer is set on a completed review.
   * (Verified across 104,884 reviewer entries: never more than one, and only ~0.03%
   * have none — those are reviews still in flight, which fall through to the status.)
   */
  const reviewAction = entry => {
    if (entry.approvedAnswer) return 'approved';
    if (entry.modifiedAnswer) return 'modified';
    if (entry.rejectedAnswer) return 'rejected';
    return entry.status ?? '';
  };

  /* ─────────────────────────── build rows ─────────────────────────── */

  // The submission history IS the work log: entry [0] is the author's answer, entries
  // [1..] are the reviewers in order. Each entry's createdAt→updatedAt spans that
  // person's own handling of the question.
  const perQuestion = docs.map(q => {
    const key = idStr(q._id);
    const qAnswers = (ansByQ.get(key) ?? []).sort(
      (a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0),
    );
    const primary = qAnswers.find(a => a.isFinalAnswer) ?? qAnswers.at(-1) ?? null;

    const history = subByQ.get(key)?.history ?? [];
    const authorEntry = history[0] ?? null;
    const chain = history.slice(1);

    return { key, qAnswers, primary, authorEntry, chain };
  });

  // Sized to the data by default (min 3, the approval rule). A few questions collect many
  // reviews after rejections/re-routes, which would add columns that are empty for almost
  // every row — --max-reviewers=N caps that; the overflow still shows in Reviewer Count.
  const observedMax = Math.max(3, ...perQuestion.map(p => p.chain.length));
  const capArg = Number(argVal('max-reviewers', 0));
  const maxReviewers = capArg > 0 ? Math.min(capArg, observedMax) : observedMax;
  if (maxReviewers < observedMax) {
    console.log(
      `ℹ️  Showing ${maxReviewers} reviewer columns — ${observedMax - maxReviewers} later ` +
        `reviewer(s) on some questions are not shown. Raise --max-reviewers to include them.`,
    );
  }

  // Accumulators for the average block written above the header.
  const totals = [];
  const authorTimes = [];
  const reviewerTimes = [];
  const moderatorTimes = [];
  const handlingTimes = [];

  const rows = perQuestion.map(({ key, authorEntry, chain }, i) => {
    const q = docs[i];

    /* ---- Author ----
       Assigned = question.firstAllocationAt; completed = the author's history entry
       createdAt (when they submitted). That entry's updatedAt is when the answer was
       finally approved much later, so it is deliberately not used. */
    const authorStart = q.firstAllocationAt ?? null;
    const authorEnd = authorEntry?.createdAt ?? null;
    const authorHours = hoursBetween(authorStart, authorEnd);

    /* ---- Reviewers ----
       Each reviewer's own history entry: createdAt → updatedAt. */
    const reviewerBlock = {};
    for (let n = 0; n < maxReviewers; n++) {
      const r = chain[n];
      const h = r ? hoursBetween(r.createdAt, r.updatedAt) : null;
      const label = `Reviewer ${n + 1}`;
      reviewerBlock[label] = r ? nameOf(r.updatedBy) : '';
      reviewerBlock[`${label} Action`] = r ? reviewAction(r) : '';
      reviewerBlock[`${label} Assigned At (IST)`] = asIST(r?.createdAt);
      reviewerBlock[`${label} Completed At (IST)`] = asIST(r?.updatedAt);
      reviewerBlock[`${label} Time`] = humanDuration(h);
    }

    /* ---- Moderator: assigned until the question was closed. ---- */
    const modStart = q.moderatorAssignedAt ?? null;
    const closedAt = q.closedAt ?? null;
    const modHours = hoursBetween(modStart, closedAt);

    // Total time taken = the question's whole life, created → closed. Blank while open.
    const totalHours = hoursBetween(q.createdAt, closedAt);
    totals.push(totalHours);

    // Hands-on time: the author's, every reviewer's and the moderator's own handling
    // time added up — i.e. the total minus the idle gaps between them. Sums ALL
    // reviewers, including any beyond the --max-reviewers display cap.
    const handledParts = [
      authorHours,
      ...chain.map(r => hoursBetween(r.createdAt, r.updatedAt)),
      modHours,
    ].filter(h => h !== null);
    const handledHours = handledParts.length
      ? handledParts.reduce((a, b) => a + b, 0)
      : null;

    if (authorHours !== null) authorTimes.push(authorHours);
    if (modHours !== null) moderatorTimes.push(modHours);
    if (handledHours !== null) handlingTimes.push(handledHours);
    chain.forEach(r => {
      const h = hoursBetween(r.createdAt, r.updatedAt);
      if (h !== null) reviewerTimes.push(h);
    });

    return {
      'Question ID': key,
      Question: q.question ?? '',
      Status: q.status ?? '',

      'Answer Author': nameOf(authorEntry?.updatedBy),
      'Author Assigned At (IST)': asIST(authorStart),
      'Author Completed At (IST)': asIST(authorEnd),
      'Author Time': humanDuration(authorHours),

      ...reviewerBlock,

      Moderator: nameOf(q.moderatorId),
      'Moderator Assigned At (IST)': asIST(modStart),
      'Moderator Completed At (IST)': asIST(closedAt),
      'Moderator Time': humanDuration(modHours),

      'Total Time Taken': humanDuration(totalHours),
      'Author + Reviewers + Moderator Time': humanDuration(handledHours),
    };
  });

  /* ─────────────────────────── write workbook ─────────────────────────── */

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet('Question Lifecycle');

  const headers = Object.keys(rows[0]);
  // No `header` here — the header row is written manually below the averages block.
  ws.columns = headers.map(h => ({
    key: h,
    // Long free-text columns get more room; timestamps a medium width.
    width: /Question$/.test(h)
      ? 60
      : /At \(IST\)$/.test(h)
        ? 22
        : Math.min(Math.max(h.length + 4, 12), 28),
  }));

  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  /* ---- Averages block, above the table ---- */
  const titleRow = ws.addRow([
    `AVERAGE TIME TAKEN — ${rows.length} question(s), ${istLabel(from).slice(0, 10)} → ${istLabel(to).slice(0, 10)} IST`,
  ]);
  titleRow.font = { bold: true, size: 12 };

  const avgLabels = [
    'Author',
    'Reviewer (per review)',
    'Moderator',
    'Author + Reviewers + Moderator',
    'Total Time Taken (created→closed)',
  ];
  const avgValues = [
    humanDuration(mean(authorTimes)),
    humanDuration(mean(reviewerTimes)),
    humanDuration(mean(moderatorTimes)),
    humanDuration(mean(handlingTimes)),
    humanDuration(mean(totals.filter(t => t !== null))),
  ];
  const avgLabelRow = ws.addRow(avgLabels);
  avgLabelRow.font = { bold: true };
  avgLabelRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E7D3' } };
  });
  const avgValueRow = ws.addRow(avgValues);
  avgValueRow.eachCell(c => {
    c.alignment = { horizontal: 'left' };
    c.numFmt = '@'; // keep "12m" as text, not coerced by the column's date format
  });

  ws.addRow([]); // spacer

  /* ---- Table ---- */
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F6EA' } };
  });
  const HEADER_ROW = headerRow.number;

  rows.forEach(r => ws.addRow(r));

  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: headers.length },
  };

  // Date formats apply per column, so scope them to the data rows only — otherwise the
  // text in the averages block above would inherit a date format.
  headers.forEach((h, i) => {
    if (!/At \(IST\)$/.test(h)) return;
    for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
      ws.getRow(r).getCell(i + 1).numFmt = 'yyyy-mm-dd hh:mm';
    }
  });

  const outPath = path.resolve(OUT);
  await wb.xlsx.writeFile(outPath);

  /* ─────────────────────────── summary ─────────────────────────── */

  const closed = rows.filter(r => CLOSED_STATUSES.includes(r.Status));
  const withTotal = totals.filter(t => t !== null);
  const avgTotal = withTotal.length
    ? withTotal.reduce((s, t) => s + t, 0) / withTotal.length
    : 0;

  console.log(
    `\n✅ Wrote ${rows.length} rows → ${outPath}` +
      `\n   Closed: ${closed.length} · with a total time: ${withTotal.length}` +
      `\n   Avg total time taken (created→closed): ${
        avgTotal ? `${avgTotal.toFixed(2)}h (${humanDuration(avgTotal)})` : 'n/a'
      }`,
  );
} finally {
  await client.close();
}
