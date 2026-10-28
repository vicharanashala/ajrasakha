/**
 * Export every final answer approved by one user to a timestamped Excel file.
 *
 * Starting point: `answers` where isFinalAnswer === true and approvedBy === TARGET_USER_ID.
 * For each matching answer (one row each):
 *   • QID / Question / status  ← questions (by answers.questionId → questions._id)
 *   • answer / sources         ← the answer document itself
 *   • Author                   ← users(question_submissions.history[0].updatedBy)
 *   • Review Level N           ← users(question_submissions.history[N].updatedBy)
 *   • Closed By (last column)  ← users(TARGET_USER_ID), the approver of every exported answer
 *
 * Review Level columns are generated up to the longest history among the exported rows.
 * If several submissions exist for one question, the one with the lowest _id (oldest) is used.
 *
 * Text over Excel's 32,767-char cell limit is cut in the cell with a marker, and the full
 * text is written to a sidecar `<report>.overflow.json` next to the workbook.
 *
 * Read-only. Reads DB_URL / DB_NAME from the environment (.env is auto-loaded, so run
 * it from the backend directory).
 *
 * Usage (from backend/):
 *   node scripts/export-final-answers-by-approver.js
 *
 * Output: backend/scripts/exports/final-answers-by-approver-<timestamp>.xlsx
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/* ─── config ─── */
// REPLACE with the _id (24-char hex) of the user whose approved final answers to export.
const TARGET_USER_ID = 'REPLACE_WITH_USER_ID';

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'exports');
const SHEET_NAME = 'Final Answer Export';
// Excel's hard per-cell character limit.
const EXCEL_CELL_LIMIT = 32767;
// Keeps $in arrays to a reasonable size on large exports.
const ID_BATCH_SIZE = 1000;

/* ─── helpers ─── */
const idStr = v => (v === null || v === undefined ? '' : v.toString());
const isObjectIdHex = v => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);

// Returns both the ObjectId and string forms of an id, so lookups match whichever
// representation was stored (the schema allows `string | ObjectId`).
function idVariants(id) {
  const s = idStr(id);
  if (!s) return [];
  return isObjectIdHex(s) ? [new ObjectId(s), s] : [s];
}

// Fetches documents whose `field` matches any of the given ids, in batches.
async function findByIds(collection, field, ids, projection) {
  const unique = [...new Set(ids.map(idStr).filter(Boolean))];
  const docs = [];
  for (let i = 0; i < unique.length; i += ID_BATCH_SIZE) {
    const values = unique.slice(i, i + ID_BATCH_SIZE).flatMap(idVariants);
    const batch = await collection
      .find({ [field]: { $in: values } })
      .project(projection)
      .sort({ _id: 1 })
      .toArray();
    docs.push(...batch);
  }
  return docs;
}

// Formats a user as "email (firstName lastName)", using whatever parts are present.
function formatUser(user) {
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  const name = [user.firstName, user.lastName]
    .filter(p => typeof p === 'string' && p.trim())
    .map(p => p.trim())
    .join(' ');
  if (email && name) return `${email} (${name})`;
  return email || name;
}

// Known SourceItem fields; anything else on a source is appended so no data is dropped.
const KNOWN_SOURCE_KEYS = new Set(['sourceName', 'source', 'sourceType', 'page']);

// Renders a single field value as plain text (objects/arrays as compact JSON).
function fieldText(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value).trim();
}

// Formats one source as "Name - link (Type: X, Page: Y, extra: value)".
function formatSourceItem(item) {
  if (item === null || item === undefined) return '';
  if (typeof item !== 'object') return fieldText(item);

  const name = fieldText(item.sourceName);
  const link = fieldText(item.source);
  const main = [name, link].filter(Boolean).join(' - ');

  const details = [];
  const type = fieldText(item.sourceType);
  const page = fieldText(item.page);
  if (type) details.push(`Type: ${type}`);
  if (page) details.push(`Page: ${page}`);
  for (const [key, value] of Object.entries(item)) {
    const text = KNOWN_SOURCE_KEYS.has(key) ? '' : fieldText(value);
    if (text) details.push(`${key}: ${text}`);
  }

  if (!details.length) return main;
  return main ? `${main} (${details.join(', ')})` : details.join(', ');
}

// Formats the answer's sources as a numbered list, one source per line.
function formatSources(sources) {
  if (sources === null || sources === undefined) return '';
  if (!Array.isArray(sources)) return formatSourceItem(sources);
  return sources
    .map(formatSourceItem)
    .filter(Boolean)
    .map((line, i) => `${i + 1}. ${line}`)
    .join('\n');
}

// Coerces a value to cell text without producing "undefined" / "null".
function toText(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

// Builds a filesystem-safe, non-colliding output path for this run.
function buildOutputPath() {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-');
  const base = `final-answers-by-approver-${stamp}`;
  let candidate = path.join(OUT_DIR, `${base}.xlsx`);
  for (let n = 1; existsSync(candidate); n++) {
    candidate = path.join(OUT_DIR, `${base}-${n}.xlsx`);
  }
  return candidate;
}

/* ─── validate config ─── */
if (!isObjectIdHex(TARGET_USER_ID)) {
  console.error(
    `❌ TARGET_USER_ID must be a 24-character hex user _id (got "${TARGET_USER_ID}"). ` +
      'Edit the constant at the top of this script.',
  );
  process.exit(1);
}
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

const client = new MongoClient(DB_URL);
const warnings = [];
const warn = msg => {
  warnings.push(msg);
  console.warn(`⚠️  ${msg}`);
};

try {
  await client.connect();
  const db = client.db(DB_NAME);
  const answersCol = db.collection('answers');
  const questionsCol = db.collection('questions');
  const submissionsCol = db.collection('question_submissions');
  const usersCol = db.collection('users');

  console.log(`DB: ${DB_NAME}`);
  console.log(`Target approver: ${TARGET_USER_ID}`);

  /* 1. Final answers approved by the target user (the starting point). */
  const answers = await answersCol
    .find({ isFinalAnswer: true, approvedBy: { $in: idVariants(TARGET_USER_ID) } })
    .project({ questionId: 1, answer: 1, sources: 1, createdAt: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  if (answers.length === 0) {
    console.log('No final answers approved by this user were found. Nothing to export.');
  } else {
    console.log(`Matching final answers: ${answers.length}`);

    /* 2. Related questions and submissions, fetched in bulk. */
    const questionIds = answers.map(a => a.questionId);
    const [questions, submissions] = await Promise.all([
      findByIds(questionsCol, '_id', questionIds, { question: 1, status: 1 }),
      findByIds(submissionsCol, 'questionId', questionIds, { questionId: 1, history: 1 }),
    ]);
    const questionById = new Map(questions.map(q => [idStr(q._id), q]));

    // Deterministic pick: submissions are sorted by _id, so the first one seen wins.
    const submissionByQuestion = new Map();
    const duplicateSubmissionQids = new Set();
    for (const s of submissions) {
      const key = idStr(s.questionId);
      if (submissionByQuestion.has(key)) duplicateSubmissionQids.add(key);
      else submissionByQuestion.set(key, s);
    }
    for (const qid of duplicateSubmissionQids) {
      warn(`Question ${qid} has multiple submissions; used the oldest (lowest _id).`);
    }

    /* 3. Users referenced by any history entry, resolved once each. */
    const userIds = new Set();
    for (const s of submissionByQuestion.values()) {
      if (!Array.isArray(s.history)) continue;
      for (const h of s.history) {
        const uid = idStr(h?.updatedBy);
        if (uid) userIds.add(uid);
      }
    }
    // The approver (Closed By) is resolved in the same batch as the history users.
    userIds.add(TARGET_USER_ID);
    const users = await findByIds(usersCol, '_id', [...userIds], {
      email: 1,
      firstName: 1,
      lastName: 1,
    });
    const userById = new Map(users.map(u => [idStr(u._id), u]));

    // Same value on every row, since all exported answers share this approver.
    const approver = userById.get(TARGET_USER_ID);
    const closedBy = approver ? formatUser(approver) : '';
    if (!approver) warn(`Approver ${TARGET_USER_ID} (Closed By) not found in users.`);
    else if (!closedBy) warn(`Approver ${TARGET_USER_ID} has no email or name.`);

    // Maps a question's submission history to identity cells: [Author, Level 1, ...].
    const resolveHistory = (qid, submission) => {
      if (!submission) {
        warn(`No question_submission for question ${qid}.`);
        return [];
      }
      if (!Array.isArray(submission.history)) {
        warn(`Submission ${idStr(submission._id)} has no valid history array.`);
        return [];
      }
      return submission.history.map((h, i) => {
        const label = i === 0 ? 'Author' : `Review Level ${i}`;
        const uid = idStr(h?.updatedBy);
        if (!uid) {
          warn(`Question ${qid}: history[${i}] (${label}) has no updatedBy.`);
          return '';
        }
        if (!isObjectIdHex(uid)) {
          warn(`Question ${qid}: history[${i}].updatedBy "${uid}" is not a valid user id.`);
        }
        const user = userById.get(uid);
        if (!user) {
          warn(`Question ${qid}: user ${uid} (${label}) not found.`);
          return '';
        }
        const formatted = formatUser(user);
        if (!formatted) warn(`User ${uid} has no email or name.`);
        return formatted;
      });
    };

    /* 4. Build one row per answer. */
    const rows = [];
    const identitiesByQuestion = new Map();
    let maxHistory = 0;
    answers.forEach((a, index) => {
      const answerId = idStr(a._id);
      const qid = idStr(a.questionId);
      if (!qid) warn(`Answer ${answerId} has no questionId.`);

      const question = qid ? questionById.get(qid) : undefined;
      if (qid && !question) warn(`Question ${qid} (answer ${answerId}) not found.`);

      // Several answers can share a question; resolve its history once.
      if (qid && !identitiesByQuestion.has(qid)) {
        identitiesByQuestion.set(qid, resolveHistory(qid, submissionByQuestion.get(qid)));
      }
      const identities = qid ? identitiesByQuestion.get(qid) : [];
      maxHistory = Math.max(maxHistory, identities.length);

      rows.push({
        answerId,
        values: {
          slNo: index + 1,
          qid: question ? idStr(question._id) : '',
          question: toText(question?.question),
          status: toText(question?.status),
          answer: toText(a.answer),
          sources: formatSources(a.sources),
        },
        identities,
      });
    });

    /* 5. Workbook. */
    const reviewLevelCount = Math.max(maxHistory - 1, 0);
    const columns = [
      { header: 'Sl No', key: 'slNo', width: 8 },
      { header: 'QID', key: 'qid', width: 27, text: true },
      { header: 'Question', key: 'question', width: 60, wrap: true },
      { header: 'status', key: 'status', width: 14 },
      { header: 'answer', key: 'answer', width: 80, wrap: true },
      { header: 'sources', key: 'sources', width: 60, wrap: true },
      { header: 'Author', key: 'h0', width: 42 },
      ...Array.from({ length: reviewLevelCount }, (_, i) => ({
        header: `Review Level ${i + 1}`,
        key: `h${i + 1}`,
        width: 42,
      })),
      { header: 'Closed By', key: 'closedBy', width: 42 },
    ];

    const outPath = buildOutputPath();
    const overflowPath = outPath.replace(/\.xlsx$/, '.overflow.json');
    const overflow = [];

    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true };

    for (const row of rows) {
      const record = { ...row.values };
      row.identities.forEach((value, i) => {
        record[`h${i}`] = value;
      });
      record.closedBy = closedBy;

      // Cut text that exceeds Excel's cell limit and keep the full value in the sidecar.
      for (const [key, value] of Object.entries(record)) {
        if (typeof value !== 'string' || value.length <= EXCEL_CELL_LIMIT) continue;
        const marker = `\n[TRUNCATED: full text in ${path.basename(overflowPath)}]`;
        record[key] = value.slice(0, EXCEL_CELL_LIMIT - marker.length) + marker;
        overflow.push({ slNo: record.slNo, qid: record.qid, answerId: row.answerId, field: key, fullText: value });
        warn(`Row ${record.slNo} field "${key}" exceeds ${EXCEL_CELL_LIMIT} chars; full text saved to overflow file.`);
      }

      // exceljs stores plain strings as text cells, never formulas, so values that
      // start with =, +, - or @ are written literally.
      ws.addRow(record);
    }

    columns.forEach((col, i) => {
      const column = ws.getColumn(i + 1);
      if (col.text) column.numFmt = '@';
      if (col.wrap) column.alignment = { wrapText: true, vertical: 'top' };
      else column.alignment = { vertical: 'top' };
    });
    ws.getRow(1).alignment = { vertical: 'middle' };
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: columns.length },
    };

    await mkdir(OUT_DIR, { recursive: true });
    await wb.xlsx.writeFile(outPath);
    if (overflow.length) {
      await writeFile(overflowPath, JSON.stringify(overflow, null, 2), 'utf8');
    }

    /* 6. Summary. */
    console.log('\n========== Final answers by approver ==========');
    console.log(`Rows exported      : ${rows.length}`);
    console.log(`Review level cols  : ${reviewLevelCount}`);
    console.log(`Users resolved     : ${userById.size}/${userIds.size}`);
    console.log(`Warnings           : ${warnings.length}`);
    if (overflow.length) console.log(`Overflow file      : ${overflowPath}`);
    console.log(`\n✅ Wrote ${outPath}`);
  }
} catch (err) {
  console.error(`❌ Export failed: ${err?.message ?? err}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
