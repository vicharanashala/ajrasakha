/**
 * Find all answers containing a banned chemical name and export to Excel.
 *
 * INPUT: a banned chemical name (substring, case-insensitive), e.g. "DDT".
 *   node scripts/find-answers-by-banned-chemical.js --chemical="DDT"
 *   node scripts/find-answers-by-banned-chemical.js --chemical="DDT" --out=report.xlsx
 *
 * LOGIC:
 *   • Find all answers where isFinalAnswer: true AND answer CONTAINS the chemical name
 *   • For each matched answer, look up the associated question using questionId
 *   • Export an Excel sheet with: Question ID, Question, Answer
 *
 * OUTPUT: an .xlsx with one "Report" sheet containing matched questions and answers.
 *
 * Read-only. Reads DB_URL / DB_NAME from the environment (.env is auto-loaded).
 *
 * Usage:
 *   node scripts/find-answers-by-banned-chemical.js --chemical="DDT"
 *   node scripts/find-answers-by-banned-chemical.js --chemical="DDT" --out=banned-report.xlsx
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
// chemical: --chemical=... or the first non-flag positional argument.
const CHEMICAL = (
  argVal('chemical', args.find(a => !a.startsWith('--')) ?? '') ?? ''
).trim();
const OUT = argVal(
  'out',
  `banned-chemical-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
);

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
console.log("DB URL ",DB_URL)
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}
if (!CHEMICAL) {
  console.error(
    '❌ No chemical name given. Pass --chemical="DDT" (or as a positional arg).',
  );
  process.exit(1);
}

/* ─── helpers ─── */
const idStr = v => (v ? v.toString() : '');
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');
  const answers = db.collection('answers');

  console.log(`Searching for answers containing: "${CHEMICAL}"`);
  console.log(`Database: ${DB_NAME}`);

  // Pass 1: Find all answers with isFinalAnswer: true that contain the chemical name
  const chemicalRegex = new RegExp(escapeRegex(CHEMICAL), 'i');
  
  const matchedAnswers = await answers
    .find({
      isFinalAnswer: true,
      answer: { $regex: chemicalRegex },
    })
    .project({ _id: 1, questionId: 1, answer: 1 })
    .toArray();

  console.log(`Found ${matchedAnswers.length} answer(s) with isFinalAnswer: true containing "${CHEMICAL}"`);

  if (matchedAnswers.length === 0) {
    console.log('No matching answers found.');
    const outPath = path.resolve(OUT);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.columns = [
      { key: 'Question ID', width: 30 },
      { key: 'Question', width: 80 },
      { key: 'Answer', width: 80 },
    ];
    const headerRow = ws.addRow(['Question ID', 'Question', 'Answer']);
    headerRow.eachCell(c => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F6EA' } };
    });
    await wb.xlsx.writeFile(outPath);
    console.log(`\n✅ Wrote empty report to ${outPath}`);
    await client.close();
    process.exit(0);
  }

  // Pass 2: Collect unique question IDs
  const questionIds = matchedAnswers.map(a => {
    if (typeof a.questionId === 'string') {
      return new ObjectId(a.questionId);
    }
    return a.questionId;
  });

  // Pass 3: Fetch the questions
  const qDocs = await questions
    .find({ _id: { $in: questionIds } })
    .project({ _id: 1, question: 1 })
    .toArray();

  const questionMap = new Map(qDocs.map(q => [idStr(q._id), q.question ?? '']));

  // Pass 4: Build rows
  const rows = matchedAnswers.map(a => {
    const qId = idStr(a.questionId);
    return {
      'Question ID': qId,
      Question: questionMap.get(qId) ?? '',
      Answer: a.answer ?? '',
    };
  });

  /* ─── workbook ─── */
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const headers = ['Question ID', 'Question', 'Answer'];
  const ws = wb.addWorksheet('Report');
  ws.columns = headers.map(h => ({
    key: h,
    width: h === 'Question ID' ? 30 : 80,
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
  console.log('\n========== Banned Chemical Report ==========');
  console.log(`Chemical  : "${CHEMICAL}"`);
  console.log(`Matched   : ${rows.length} answer(s)`);
  console.log(`\n✅ Wrote ${outPath}`);
} finally {
  await client.close();
}