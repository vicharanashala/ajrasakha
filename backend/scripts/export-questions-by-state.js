/**
 * Export questions where details.state matches one of:
 *   <unknown>, All, Not Specified, all
 *
 * The details object fields are expanded into separate columns.
 * domain and tools_used are arrays and are joined with semicolons.
 *
 * Usage:
 *   node scripts/export-questions-by-state.js                    # default output
 *   node scripts/export-questions-by-state.js --out=output.xlsx
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

const OUT = argVal(
  'out',
  `questions-by-state-${new Date().toISOString().slice(0, 10)}.xlsx`,
);

const DB_URL = process.env.DB_URL;
const DB_NAME = process.env.DB_NAME || 'agriai';
if (!DB_URL) {
  console.error('❌ DB_URL is not set (put it in .env or pass it inline).');
  process.exit(1);
}

/* ─────────────────────────────── constants ─────────────────────────────── */

// States to match (case-insensitive)
const TARGET_STATES = ['<unknown>', 'All', 'Not Specified', 'all'];

/* ─────────────────────────────── helpers ─────────────────────────────── */

const idStr = v => (v ? v.toString() : '');

/** Convert details.domain array to semicolon-separated string */
const formatArray = arr => {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return '';
  return arr.join('; ');
};

/** Format crop object or string */
const formatCrop = crop => {
  if (!crop) return '';
  if (typeof crop === 'string') return crop;
  if (typeof crop === 'object' && crop.name) return crop.name;
  return JSON.stringify(crop);
};

/** IST offset for timestamp formatting */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Format date to IST string */
const formatIST = date => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
};

/* ─────────────────────────────── run ─────────────────────────────── */

const client = new MongoClient(DB_URL);
await client.connect();
const db = client.db(DB_NAME);

try {
  const questions = db.collection('questions');

  // Build case-insensitive regex match for all target states
  const stateRegexes = TARGET_STATES.map(s => new RegExp(`^${s}$`, 'i'));
  
  const match = {
    'details.state': { $in: stateRegexes },
    isTesting: { $ne: true },
  };

  console.log(`\n🎯 Exporting questions where details.state matches: ${TARGET_STATES.join(', ')}`);

  const docs = await questions.find(match).sort({ createdAt: -1 }).toArray();
  console.log(`📦 Questions found: ${docs.length}`);

  if (docs.length === 0) {
    console.log('Nothing to export — no questions matched. Exiting without writing a file.');
    process.exit(0);
  }

  /* ─────────────────────────── build rows ─────────────────────────── */

  const rows = docs.map(q => {
    const details = q.details || {};
    
    return {
      'Question ID': idStr(q._id),
      'Question': q.question || '',
      'Source': q.source || '',
      'State': details.state || '',
      'District': details.district || '',
      'Crop': formatCrop(details.crop),
      'Season': details.season || '',
      'Domain': formatArray(details.domain),
      'Normalised Crop': details.normalised_crop || '',
      'Tools Used': formatArray(details.tools_used),
      'Created At (IST)': formatIST(q.createdAt),
    };
  });

  /* ─────────────────────────── write workbook ─────────────────────────── */

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet('Questions by State');

  // Define columns with appropriate widths
  const columnWidths = {
    'Question ID': 28,
    'Question': 80,
    'Source': 15,
    'State': 18,
    'District': 20,
    'Crop': 25,
    'Season': 15,
    'Domain': 40,
    'Normalised Crop': 25,
    'Tools Used': 40,
    'Created At (IST)': 22,
  };

  const headers = Object.keys(rows[0]);
  ws.columns = headers.map(h => ({
    key: h,
    width: columnWidths[h] || 20,
  }));

  // Add title row
  const titleRow = ws.addRow([
    `Questions with State: ${TARGET_STATES.join(', ')} — ${rows.length} total`,
  ]);
  titleRow.font = { bold: true, size: 12 };
  ws.mergeCells(`A1:${String.fromCharCode(64 + headers.length)}1`);

  ws.addRow([]); // spacer

  // Add header row
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F6EA' } };
    c.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  const HEADER_ROW = headerRow.number;

  // Add data rows
  rows.forEach(r => {
    const row = ws.addRow(r);
    row.eachCell(c => {
      c.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      // Wrap text for long columns
      if (['Question', 'Domain', 'Tools Used'].includes(c.$col$row === c.$col$row ? '' : c.value?.toString() || '')) {
        c.alignment = { wrapText: true, vertical: 'top' };
      }
    });
  });

  // Freeze header row
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }];
  
  // Add auto filter
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: headers.length },
  };

  // Set row heights for better readability
  for (let i = HEADER_ROW + 1; i <= ws.rowCount; i++) {
    ws.getRow(i).height = 30;
  }

  const outPath = path.resolve(OUT);
  await wb.xlsx.writeFile(outPath);

  /* ─────────────────────────── summary ─────────────────────────── */

  // Count by state
  const stateCounts = {};
  for (const row of rows) {
    const state = row.State || '(empty)';
    stateCounts[state] = (stateCounts[state] || 0) + 1;
  }

  console.log(`\n✅ Wrote ${rows.length} rows → ${outPath}`);
  console.log('\nBreakdown by state:');
  for (const [state, count] of Object.entries(stateCounts)) {
    console.log(`   ${state}: ${count}`);
  }
} finally {
  await client.close();
}