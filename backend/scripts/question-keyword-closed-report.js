/**
 * Fetch every CLOSED question whose text CONTAINS a given keyword and export an Excel
 * sheet with the question's metadata (the `details` sub-doc: state / district / crop /
 * season / domain) plus the people involved — Author, Reviewer(s) and Moderator.
 *
 * INPUT: a single keyword (substring, case-insensitive), e.g. "gulli danda".
 *   node scripts/question-keyword-closed-report.js --keyword="gulli danda"
 *   node scripts/question-keyword-closed-report.js "gulli danda"        (positional)
 *
 * MATCHING:
 *   • questions.question OR questions.text CONTAINS the keyword (case-insensitive, not anchored)
 *   • question is closed  (status ∈ closed / dynamic_closed / duplicate_closed)
 *
 * For each matched question:
 *   • Metadata      ← question.details.{state, district, crop, season, domain}
 *   • Author name   ← users(question_submissions.history[0].updatedBy)
 *   • Reviewer names ← users(question_submissions.history[1..].updatedBy) — one column each
 *   • Moderator name ← users(answers.approvedBy) — the final answer's approver
 *   • Answer         ← the final (approved) answer's text
 *   • Initial Status ← question.referenceQuestionId present ? "Duplicate" : "Unique"
 *
 * OUTPUT: an .xlsx with one "Report" sheet.
 *
 * Read-only. Reads DB_URL / DB_NAME from the environment (.env is auto-loaded).
 *
 * Usage:
 *   node scripts/question-keyword-closed-report.js --keyword="gulli danda"
 *   node scripts/question-keyword-closed-report.js --keyword="gulli danda" --out=gulli.xlsx --db=agriai
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import path from 'node:path';

/* ─── args ─── */
const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
// keyword: --keyword=... or the first non-flag positional argument.
const KEYWORD = (
  argVal('keyword', args.find(a => !a.startsWith('--')) ?? '') ?? ''
).trim();
const OUT = argVal(
  'out',
  `keyword-closed-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
);

const DB_URL = process.env.DB_URL
const DB_NAME = 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}
if (!KEYWORD) {
  console.error(
    '❌ No keyword given. Pass --keyword="gulli danda" (or as a positional arg).',
  );
  process.exit(1);
}

const CLOSED_STATUSES = ['closed'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/* ─── helpers ─── */
const idStr = v => (v ? v.toString() : '');
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameOf = (userById, id) => {
  const u = userById.get(idStr(id));
  if (!u) return '';
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || '';
};
const fmtDomain = v =>
  Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
// Excel cells carry no timezone, so print the wall-clock IST string directly.
const istStr = v => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime())
    ? new Date(d.getTime() + IST_OFFSET_MS)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ')
    : '';
};

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');
  const answers = db.collection('answers');
  const submissions = db.collection('question_submissions');
  const usersCol = db.collection('users');

  // Pass 1: all closed questions whose text contains the keyword. Skip the heavy
  // embedding vector — the report never reads it.
  const kwRegex = { $regex: escapeRegex(KEYWORD), $options: 'i' };
  const qDocs = await questions
    .find(
      {
        // Match the keyword in the question OR its text field.
        $or: [{ question: kwRegex }, { text: kwRegex }],
      //  status: { $in: CLOSED_STATUSES },
      },
      { projection: { embedding: 0 } },
    )
    .sort({ createdAt: 1 })
    .toArray();

  if (qDocs.length === 0) {
    console.log(
      `\nNo closed questions contain "${KEYWORD}" in ${DB_NAME}. Nothing to write.`,
    );
    process.exit(0);
  }

  // Pass 2: bulk-fetch answers + submissions + users for all matched questions.
  const qIds = qDocs.map(q => q._id);
  const [ans, subs] = await Promise.all([
    // Skip the heavy answer embedding vector — we only need the answer text/meta.
    answers
      .find({ questionId: { $in: qIds } }, { projection: { embedding: 0 } })
      .toArray(),
    submissions.find({ questionId: { $in: qIds } }).toArray(),
  ]);

  const ansByQ = new Map();
  for (const a of ans) {
    const k = idStr(a.questionId);
    if (!ansByQ.has(k)) ansByQ.set(k, []);
    ansByQ.get(k).push(a);
  }
  const subByQ = new Map(subs.map(s => [idStr(s.questionId), s]));

  const userIds = new Set();
  for (const a of ans) if (a.approvedBy) userIds.add(idStr(a.approvedBy));
  // Submission work-log: history[0].updatedBy is the author, history[1..] reviewers.
  for (const s of subs) {
    (s.history ?? []).forEach(h => {
      if (h?.updatedBy) userIds.add(idStr(h.updatedBy));
    });
  }
  const users = userIds.size
    ? await usersCol
        .find({ _id: { $in: [...userIds].map(id => new ObjectId(id)) } })
        .project({ firstName: 1, lastName: 1, email: 1 })
        .toArray()
    : [];
  const userById = new Map(users.map(u => [idStr(u._id), u]));

  // Pass 3: build one row per matched question.
  let maxReviewers = 0;
  const rows = qDocs.map(q => {
    const list = (ansByQ.get(idStr(q._id)) ?? []).sort(
      (a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0),
    );
    // Moderator: final answer's approver wins; else the latest answer's approver.
    const primary = list.find(a => a.isFinalAnswer) ?? list.at(-1) ?? null;

    const history = subByQ.get(idStr(q._id))?.history ?? [];
    const authorId = history[0]?.updatedBy;
    const reviewers = history
      .slice(1)
      .map(h => nameOf(userById, h?.updatedBy))
      .filter(Boolean);
    maxReviewers = Math.max(maxReviewers, reviewers.length);

    const reviewerCols = {};
    reviewers.forEach((name, i) => {
      reviewerCols[`Reviewer ${i + 1}`] = name;
    });

    const d = q.details ?? {};
    return {
      'Question ID': idStr(q._id),
      Question: q.question ?? '',
      Status: q.status ?? '',
      Source: q.source ?? '',
      // Metadata (question.details).
      State: d.state ?? '',
      District: d.district ?? '',
      Crop: d.crop ?? '',
      Season: d.season ?? '',
      Domain: fmtDomain(d.domain),
      'Created At (IST)': istStr(q.createdAt),
      'Closed At (IST)': istStr(q.closedAt),
      'Author Name': nameOf(userById, authorId),
      ...reviewerCols,
      'Moderator Name': nameOf(userById, primary?.approvedBy),
      // The final (approved) answer's text.
      Answer: primary?.answer ?? '',
      'Initial Status': q.referenceQuestionId ? 'Duplicate' : 'Unique',
    };
  });

  /* ─── workbook ─── */
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const reviewerHeaders = Array.from(
    { length: maxReviewers },
    (_, i) => `Reviewer ${i + 1}`,
  );
  // Reviewer columns sit right after Author Name (matching the row shape above).
  const headers = [
    'Question ID',
    'Question',
    'Status',
    'Source',
    'State',
    'District',
    'Crop',
    'Season',
    'Domain',
    'Created At (IST)',
    'Closed At (IST)',
    'Author Name',
    ...reviewerHeaders,
    'Moderator Name',
    'Answer',
    'Initial Status',
  ];

  const ws = wb.addWorksheet('Report');
  ws.columns = headers.map(h => ({
    key: h,
    width: /Question$|^Answer$/i.test(h)
      ? 60
      : /At \(IST\)$/.test(h)
        ? 20
        : Math.min(Math.max(h.length + 4, 14), 30),
  }));
  const headerRow = ws.addRow(headers);
  headerRow.eachCell(c => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F6EA' } };
  });
  rows.forEach(r => ws.addRow(r));
  ws.views = [{ state: 'frozen', ySplit: headerRow.number }];
  ws.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: headers.length },
  };

  const outPath = path.resolve(OUT);
  await wb.xlsx.writeFile(outPath);

  /* ─── summary ─── */
  console.log('\n========== Keyword closed-question report ==========');
  console.log(`DB       : ${DB_NAME}`);
  console.log(`Keyword  : "${KEYWORD}"`);
 // console.log(`Statuses : ${CLOSED_STATUSES.join(', ')}`);
  console.log(`Matched  : ${rows.length} closed question(s)`);
  console.log(`\n✅ Wrote ${outPath}`);
} finally {
  await client.close();
}
