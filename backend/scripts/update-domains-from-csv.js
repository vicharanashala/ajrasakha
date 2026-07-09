/**
 * Update `details.domain` on questions from a CSV file.
 *
 * For every row in the CSV we look up a question in the `questions` collection
 * whose `question` text matches the CSV's question column. When a match is found
 * we REPLACE the existing `details.domain` array with the domain value from the
 * CSV (i.e. remove whatever domains were there and push the new one).
 *
 * The CSV domain cell is a plain string. If it contains several domains separated
 * by `;`, `|` or `,`, each becomes a separate array element; otherwise it is a
 * single-element array.
 *
 * SAFETY: dry-run by default. It only writes when you pass --apply.
 *
 * Usage:
 *   node scripts/update-domains-from-csv.js <file.csv>                 # dry run
 *   node scripts/update-domains-from-csv.js <file.csv> --apply         # write
 *
 * Options:
 *   --question-col <name>   Header of the question column (default: auto-detect)
 *   --domain-col <name>     Header of the domain column   (default: auto-detect)
 *   --loose                 Case-insensitive / whitespace-tolerant question match
 *   --apply                 Actually write the updates (otherwise dry run)
 *
 * Reads DB_URL / DB_NAME from the environment (.env is auto-loaded).
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { MongoClient } from 'mongodb';

// Default data file — paste your real records into scripts/domains-data.json.
// You can still override it by passing a path as the first argument.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = resolve(__dirname, 'domains-data.json');

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LOOSE = argv.includes('--loose');

const getOpt = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};
const questionColOpt = getOpt('--question-col');
const domainColOpt = getOpt('--domain-col');

// Use the passed path if given, otherwise fall back to the bundled data file.
const csvPath =
  argv.find((a) => !a.startsWith('--') && a !== questionColOpt && a !== domainColOpt) ??
  DEFAULT_DATA_FILE;

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Minimal CSV parser (handles quoted fields, escaped quotes, commas & newlines
// inside quotes). Returns an array of string arrays (rows of cells).
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  // Strip a leading BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      // Handle \r\n as a single line break.
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  // Flush trailing cell/row (file may not end with a newline).
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const normalise = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
// Escape a string for use inside a RegExp.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toDomains = (domainStr) =>
  (domainStr ?? '')
    .toString()
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);

const pickKey = (explicit, keys, candidates) => {
  if (explicit) {
    const k = keys.find((h) => h.toLowerCase() === explicit.toLowerCase());
    if (!k) {
      console.error(`❌ Field "${explicit}" not found. Fields: ${keys.join(', ')}`);
      process.exit(1);
    }
    return k;
  }
  for (const cand of candidates) {
    const k = keys.find((h) => h.toLowerCase() === cand);
    if (k) return k;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Read + parse input (accepts .json or .csv — detected by extension/content)
// ---------------------------------------------------------------------------
const raw = readFileSync(csvPath, 'utf8');
const isJson = /\.json$/i.test(csvPath) || raw.trimStart().startsWith('[') || raw.trimStart().startsWith('{');

const rows = [];
let qField, dField;

if (isJson) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('❌ Could not parse JSON:', e.message);
    process.exit(1);
  }
  if (!Array.isArray(data)) data = [data];
  if (!data.length) {
    console.error('❌ JSON has no records.');
    process.exit(1);
  }
  const keys = Object.keys(data[0]);
  qField = pickKey(questionColOpt, keys, ['question', 'questions', 'question text', 'query']);
  dField = pickKey(domainColOpt, keys, ['domain', 'domains', 'new domain']);
  if (!qField || !dField) {
    console.error(
      `❌ Could not find question/domain fields. Fields: ${keys.join(', ')}\n` +
        `   Pass --question-col <name> and/or --domain-col <name>.`,
    );
    process.exit(1);
  }
  data.forEach((obj, i) => {
    const question = (obj[qField] ?? '').toString().trim();
    if (!question) return;
    const domainStr = Array.isArray(obj[dField]) ? obj[dField].join(',') : obj[dField];
    rows.push({ line: i + 1, question, domainStr: String(domainStr ?? ''), domains: toDomains(domainStr) });
  });
} else {
  const table = parseCsv(raw).filter((r) => r.some((c) => c.trim() !== '')); // drop blank lines
  if (table.length < 2) {
    console.error('❌ CSV has no data rows.');
    process.exit(1);
  }
  const header = table[0].map((h) => h.trim());
  const findCol = (explicit, candidates) => {
    if (explicit) {
      const idx = header.findIndex((h) => h.toLowerCase() === explicit.toLowerCase());
      if (idx === -1) {
        console.error(`❌ Column "${explicit}" not found. Headers: ${header.join(', ')}`);
        process.exit(1);
      }
      return idx;
    }
    for (const cand of candidates) {
      const idx = header.findIndex((h) => h.toLowerCase() === cand);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const qCol = findCol(questionColOpt, ['question', 'questions', 'question text', 'query']);
  const dCol = findCol(domainColOpt, ['domain', 'domains', 'new domain']);
  if (qCol === -1 || dCol === -1) {
    console.error(
      `❌ Could not auto-detect columns. Headers: ${header.join(', ')}\n` +
        `   Pass --question-col <name> and/or --domain-col <name>.`,
    );
    process.exit(1);
  }
  qField = header[qCol];
  dField = header[dCol];
  for (let r = 1; r < table.length; r++) {
    const question = (table[r][qCol] ?? '').trim();
    if (!question) continue;
    const domainStr = (table[r][dCol] ?? '').trim();
    rows.push({ line: r + 1, question, domainStr, domains: toDomains(domainStr) });
  }
}

console.log('========== Update details.domain from file ==========');
console.log(`DB    : ${DB_NAME}`);
console.log(`File  : ${csvPath} (${isJson ? 'JSON' : 'CSV'})`);
console.log(`Fields: question="${qField}"  domain="${dField}"`);
console.log(`Match : ${LOOSE ? 'loose (case/space-insensitive)' : 'exact'}`);
console.log(`Mode  : ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes — pass --apply)'}`);
console.log(`Rows  : ${rows.length}`);
console.log('====================================================\n');

// ---------------------------------------------------------------------------
// Connect + process
// ---------------------------------------------------------------------------
const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

let matched = 0;
let updated = 0;
let unchanged = 0;
let notFound = 0;
let emptyDomain = 0;
const notFoundSamples = [];

try {
  const questions = db.collection('questions');

  for (const row of rows) {
    // Find the matching question. Exact match hits the `question` index directly.
    // Loose match normalises whitespace/case in JS: fetch candidates by first word,
    // then confirm the normalised, lower-cased forms are equal.
    const doc = LOOSE
      ? (await questions
          .find({ question: { $regex: `${escapeRe(row.question.split(/\s+/)[0])}`, $options: 'i' } })
          .toArray()).find((d) => normalise(d.question).toLowerCase() === normalise(row.question).toLowerCase())
      : await questions.findOne({ question: row.question });

    if (!doc) {
      notFound++;
      if (notFoundSamples.length < 15) notFoundSamples.push(`line ${row.line}: "${row.question.slice(0, 70)}"`);
      continue;
    }
    matched++;

    if (row.domains.length === 0) {
      emptyDomain++;
      console.warn(`⚠️  line ${row.line}: empty domain, skipping ("${row.question.slice(0, 60)}")`);
      continue;
    }

    const current = Array.isArray(doc.details?.domain)
      ? doc.details.domain
      : doc.details?.domain != null
        ? [doc.details.domain]
        : [];
    const same =
      current.length === row.domains.length && current.every((v, i) => v === row.domains[i]);
    if (same) {
      unchanged++;
      continue;
    }

    if (APPLY) {
      await questions.updateOne(
        { _id: doc._id },
        { $set: { 'details.domain': row.domains, updatedAt: new Date() } },
      );
    }
    updated++;
    console.log(
      `${APPLY ? '✅' : '•'} line ${row.line}: [${current.join(', ')}] → [${row.domains.join(', ')}]  ("${row.question.slice(0, 50)}...")`,
    );
  }

  console.log('\n==================== Summary ====================');
  console.log(`Matched in DB          : ${matched}`);
  console.log(`Domain ${APPLY ? 'updated' : 'to update'}       : ${updated}`);
  console.log(`Already correct        : ${unchanged}`);
  console.log(`Empty domain (skipped) : ${emptyDomain}`);
  console.log(`Not found in DB        : ${notFound}`);
  if (notFoundSamples.length) {
    console.log('\nNot-found samples:');
    notFoundSamples.forEach((s) => console.log('  - ' + s));
  }
  if (!APPLY && updated) {
    console.log(`\nDRY RUN — re-run with --apply to write ${updated} update(s).`);
  }
} catch (err) {
  console.error('❌ Failed:', err);
  process.exitCode = 1;
} finally {
  await client.close();
}
