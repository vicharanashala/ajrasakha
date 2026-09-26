/**
 * Match a list of question JSON docs against the DB and export an Excel sheet with
 * the Author name and Moderator name for each, plus an "Initial Status" column.
 *
 * INPUT: a JSON array file (default scripts/data/author-moderator-input.json). Paste
 * your questions there. Each item can carry any columns — the example shape is:
 *   {
 *     "Question": "Why do sugarcane leaves turn yellow near maturity in Rupnagar?",
 *     "State": "Punjab", "District": "Rupnagar", "Crop": "Sugarcane",
 *     "Season": "General", "Domain": "[\"...\"]", "Status": "closed",
 *     "Priority": "high", "Source": "WHATSAPP", "All Users": ""
 *   }
 *
 * MATCHING: by the "Question" text (exact, case-insensitive, trimmed).
 *
 * For each matched question:
 *   • Author name    ← users(question_submissions.history[0].updatedBy) — the author entry
 *   • Reviewer names ← users(question_submissions.history[1..].updatedBy) — one column each
 *   • Moderator name ← users(answers.approvedBy) — who approved the final answer
 *   • Initial Status ← question.referenceQuestionId present ? "Duplicate" : "Unique"
 *
 * OUTPUT: an .xlsx with two sheets — "Matched" (input columns + Question ID, Author
 * Name, Moderator Name, Initial Status) and "Unmatched" (the input rows with no DB hit).
 * Unmatched docs are also printed to the console at the end.
 *
 * Read-only. Reads DB_URL / DB_NAME from the environment (.env is auto-loaded).
 *
 * Usage:
 *   node scripts/question-author-moderator-report.js
 *   node scripts/question-author-moderator-report.js --in=scripts/data/my.json --out=report.xlsx
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

/* ─── args ─── */
const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const IN = argVal('in', 'scripts/data/author-moderator-input.json');
const OUT = argVal(
  'out',
  `author-moderator-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
);

const DB_URL = process.env.DB_URL
const DB_NAME =  'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

/* ─── helpers ─── */
const idStr = v => (v ? v.toString() : '');
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameOf = (userById, id) => {
  const u = userById.get(idStr(id));
  if (!u) return '';
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || '';
};

/* ─── load input ─── */
let input;
try {
  input = JSON.parse(await readFile(path.resolve(IN), 'utf8'));
} catch (e) {
  console.error(`❌ Could not read/parse input JSON at ${IN}: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(input)) {
  console.error('❌ Input JSON must be an ARRAY of question objects.');
  process.exit(1);
}
if (input.length === 0) {
  console.error('❌ Input array is empty — nothing to do.');
  process.exit(1);
}

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');
  const answers = db.collection('answers');
  const submissions = db.collection('question_submissions');
  const usersCol = db.collection('users');

  const matchedRows = [];
  const unmatchedRows = [];
  const multiMatch = [];

  // Pass 1: resolve each input question to a DB document (exact, case-insensitive).
  const resolved = []; // { item, qDoc }
  for (const item of input) {
    const text = String(item.Question ?? item.question ?? '').trim();
    if (!text) {
      unmatchedRows.push({ ...item, _reason: 'No Question text in input' });
      continue;
    }
    const hits = await questions
      .find({ question: { $regex: `^${escapeRegex(text)}$`, $options: 'i' } })
      .toArray();
    if (hits.length === 0) {
      unmatchedRows.push({ ...item, _reason: 'No matching question in DB' });
      continue;
    }
    if (hits.length > 1) multiMatch.push({ text, count: hits.length });
    // Prefer a question whose state/district also match when several share the text.
    const best =
      hits.find(
        q =>
          (!item.State ||
            String(q.details?.state ?? '').toLowerCase() ===
              String(item.State).toLowerCase()) &&
          (!item.District ||
            String(q.details?.district ?? '').toLowerCase() ===
              String(item.District).toLowerCase()),
      ) ?? hits[0];
    resolved.push({ item, qDoc: best });
  }

  // Pass 2: bulk-fetch answers + submissions + users for all matched questions.
  const qIds = resolved.map(r => r.qDoc._id);
  const [ans, subs] = await Promise.all([
    qIds.length ? answers.find({ questionId: { $in: qIds } }).toArray() : [],
    qIds.length ? submissions.find({ questionId: { $in: qIds } }).toArray() : [],
  ]);
  const ansByQ = new Map();
  for (const a of ans) {
    const k = idStr(a.questionId);
    if (!ansByQ.has(k)) ansByQ.set(k, []);
    ansByQ.get(k).push(a);
  }
  const subByQ = new Map(subs.map(s => [idStr(s.questionId), s]));

  const userIds = new Set();
  for (const list of ansByQ.values()) {
    for (const a of list) {
      if (a.approvedBy) userIds.add(idStr(a.approvedBy));
    }
  }
  // Submission work-log: history[0].updatedBy is the author, history[1..] the
  // reviewers. Collect every updatedBy so we can resolve author + reviewer names.
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

  // Pass 3: build one output row per matched question.
  let maxReviewers = 0;
  for (const { item, qDoc } of resolved) {
    const list = (ansByQ.get(idStr(qDoc._id)) ?? []).sort(
      (a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0),
    );
    // Moderator: final answer's approver wins; else the latest answer's approver.
    const primary = list.find(a => a.isFinalAnswer) ?? list.at(-1) ?? null;

    // Submission work-log: history[0] is the author, history[1..] the reviewers.
    const history = subByQ.get(idStr(qDoc._id))?.history ?? [];
    const authorId = history[0]?.updatedBy;
    const reviewers = history
      .slice(1)
      .map(h => nameOf(userById, h?.updatedBy))
      .filter(Boolean);
    maxReviewers = Math.max(maxReviewers, reviewers.length);

    // One column per reviewer ("Reviewer 1", "Reviewer 2", …).
    const reviewerCols = {};
    reviewers.forEach((name, i) => {
      reviewerCols[`Reviewer ${i + 1}`] = name;
    });

    matchedRows.push({
      ...item,
      'Question ID': idStr(qDoc._id),
      'Author Name': nameOf(userById, authorId),
      ...reviewerCols,
      'Moderator Name': nameOf(userById, primary?.approvedBy),
      // Initial Status: a referenceQuestionId means it was matched to an existing
      // question → Duplicate; otherwise it is a fresh, Unique question.
      'Initial Status': qDoc.referenceQuestionId ? 'Duplicate' : 'Unique',
    });
  }

  /* ─── workbook ─── */
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const styleHeader = row =>
    row.eachCell(c => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F6EA' } };
    });

  // Matched sheet — columns = input keys (from the first input row) + the new ones.
  // Reviewer columns are sized to the question with the most reviewers.
  const baseKeys = Object.keys(input[0] ?? {});
  const reviewerHeaders = Array.from(
    { length: maxReviewers },
    (_, i) => `Reviewer ${i + 1}`,
  );
  const matchedHeaders = [
    ...baseKeys,
    'Question ID',
    'Author Name',
    ...reviewerHeaders,
    'Moderator Name',
    'Initial Status',
  ];
  const wsM = wb.addWorksheet('Matched');
  wsM.columns = matchedHeaders.map(h => ({
    key: h,
    width: /Question$/i.test(h) ? 60 : Math.min(Math.max(h.length + 4, 14), 30),
  }));
  const mh = wsM.addRow(matchedHeaders);
  styleHeader(mh);
  matchedRows.forEach(r => wsM.addRow(r));
  wsM.views = [{ state: 'frozen', ySplit: mh.number }];
  wsM.autoFilter = {
    from: { row: mh.number, column: 1 },
    to: { row: mh.number, column: matchedHeaders.length },
  };

  // Unmatched sheet — input columns + a reason.
  const unmatchedHeaders = [...baseKeys, 'Reason'];
  const wsU = wb.addWorksheet('Unmatched');
  wsU.columns = unmatchedHeaders.map(h => ({
    key: h === 'Reason' ? '_reason' : h,
    width: /Question$/i.test(h) ? 60 : Math.min(Math.max(h.length + 4, 14), 30),
  }));
  const uh = wsU.addRow(unmatchedHeaders);
  styleHeader(uh);
  unmatchedRows.forEach(r => wsU.addRow(r));

  const outPath = path.resolve(OUT);
  await wb.xlsx.writeFile(outPath);

  /* ─── summary ─── */
  console.log('\n========== Author / Moderator report ==========');
  console.log(`DB: ${DB_NAME}`);
  console.log(`Input rows : ${input.length}`);
  console.log(`Matched    : ${matchedRows.length}`);
  console.log(`Unmatched  : ${unmatchedRows.length}`);
  if (multiMatch.length) {
    console.log(
      `\n⚠️  ${multiMatch.length} question text(s) matched MORE than one DB document ` +
        `(picked the best state/district match, else the first):`,
    );
    multiMatch.forEach(m => console.log(`   • (${m.count}×) ${m.text}`));
  }
  if (unmatchedRows.length) {
    console.log('\n❌ Unmatched documents:');
    unmatchedRows.forEach(r =>
      console.log(`   • ${r.Question ?? r.question ?? '(no text)'}  — ${r._reason}`),
    );
  }
  console.log(`\n✅ Wrote ${outPath}`);
} finally {
  await client.close();
}
