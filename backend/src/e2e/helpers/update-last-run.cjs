#!/usr/bin/env node
/**
 * Reads src/e2e/last-run.log, extracts per-suite pass/fail results,
 * and replaces (or appends) a "## Last Run" section in each .e2e.md.
 *
 * Usage:  node src/e2e/helpers/update-last-run.js
 */

const fs = require('fs');
const path = require('path');

const E2E_DIR = path.join(__dirname, '..');
const LOG_FILE = path.join(E2E_DIR, 'last-run.log');

// Map: relative test-file path → relative .md path (both relative to E2E_DIR)
const SUITE_MAP = {
  'ajrasakha/AjrasakhaQuestion.e2e.test.ts':       'ajrasakha/AjrasakhaQuestion.e2e.md',
  'auto-allocation/AutoAllocation.e2e.test.ts':     'auto-allocation/AutoAllocation.e2e.md',
  'chemical/ChemicalCrud.e2e.test.ts':              'chemical/ChemicalCrud.e2e.md',
  'manual-allocation/ManualAllocation.e2e.test.ts': 'manual-allocation/ManualAllocation.e2e.md',
  'post-allocation/PostAllocation.e2e.test.ts':     'post-allocation/PostAllocation.e2e.md',
  'question/QuestionCreate.e2e.test.ts':            'question/QuestionCreate.e2e.md',
  'reviewer-queue/ReviewerQueue.e2e.test.ts':       'reviewer-queue/ReviewerQueue.e2e.md',
  'whatsapp/WhatsAppQuestion.e2e.test.ts':          'whatsapp/WhatsAppQuestion.e2e.md',
};

// Display order and descriptions for the README "Suites at a glance" table
const SUITE_META = [
  { key: 'chemical/ChemicalCrud.e2e.test.ts',              name: 'Chemical CRUD',        covers: 'Auth smoke tests, admin + moderator CRUD, role guards (expert blocked)' },
  { key: 'question/QuestionCreate.e2e.test.ts',            name: 'Question CRUD',        covers: 'Moderator create / get / update / delete / bulk-delete (OUTREACH source)' },
  { key: 'reviewer-queue/ReviewerQueue.e2e.test.ts',       name: 'Reviewer queue',       covers: '`POST /allocated` visibility: author slot, reviewer slot, exclusions, `review_level_number`' },
  { key: 'whatsapp/WhatsAppQuestion.e2e.test.ts',          name: 'WhatsApp ingestion',   covers: 'Full ingestion pipeline: auth, GDB duplicate paths, LLM filter, thread validation + retry' },
  { key: 'ajrasakha/AjrasakhaQuestion.e2e.test.ts',        name: 'AjraSakha ingestion',  covers: 'AJRASAKHA-specific fields (userId from `@CurrentUser`, notification type), representative pipeline cases' },
  { key: 'manual-allocation/ManualAllocation.e2e.test.ts', name: 'Manual allocation',    covers: '`POST /allocate-experts` + `DELETE /allocation` on an OUTREACH question' },
  { key: 'auto-allocation/AutoAllocation.e2e.test.ts',     name: 'Auto allocation',      covers: 'AGRI_EXPERT background queue, preference scoring, toggle, time-bound allocation (WHATSAPP/AJRASAKHA), capacity, reviewer, concurrent guard' },
  { key: 'post-allocation/PostAllocation.e2e.test.ts',     name: 'Post-allocation',      covers: 'Full expert peer-review → moderator-approval state machine' },
];

// ─── regex ────────────────────────────────────────────────────────────────────

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// Suite result-block headers
// " ❯ src/e2e/ajrasakha/AjrasakhaQuestion.e2e.test.ts (9 tests | 5 failed) 20151ms"
const SUITE_FAIL_RE = /^ ❯ src\/e2e\/(\S+) \((\d+) tests?(?: \| (\d+) failed)?\) (\d+)ms$/;
// " ✓ src/e2e/chemical/ChemicalCrud.e2e.test.ts (15 tests) 7776ms"
const SUITE_PASS_RE = /^ ✓ src\/e2e\/(\S+) \((\d+) tests?\) (\d+)ms$/;

// Individual test lines inside a result block
//   "   ✓ Some test name  316ms"
const TEST_PASS_RE = /^   ✓ (.+?) {1,3}(\d+)ms$/;
//   "   × Some failing test 841ms"
const TEST_FAIL_RE = /^   × (.+?) (\d+)ms$/;
//   "     → expected 400 to be 201"
const REASON_RE    = /^     → (.+)$/;

// ─── parse ────────────────────────────────────────────────────────────────────

function parseLog(raw) {
  const lines = stripAnsi(raw).split('\n');
  const suites = {}; // key: relative test path

  let current = null; // current suite entry

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Suite with failures
    let m = SUITE_FAIL_RE.exec(line);
    if (m) {
      current = {
        total:    parseInt(m[2], 10),
        failed:   m[3] ? parseInt(m[3], 10) : 0,
        duration: parseInt(m[4], 10),
        tests:    [],
      };
      suites[m[1]] = current;
      continue;
    }

    // Suite all-passing
    m = SUITE_PASS_RE.exec(line);
    if (m) {
      current = {
        total:    parseInt(m[2], 10),
        failed:   0,
        duration: parseInt(m[3], 10),
        tests:    [],
      };
      suites[m[1]] = current;
      continue;
    }

    if (!current) continue;

    // Passing test
    m = TEST_PASS_RE.exec(line);
    if (m) {
      current.tests.push({ name: m[1].trim(), pass: true, ms: parseInt(m[2], 10), reason: null });
      continue;
    }

    // Failing test — peek at the next line for the inline reason
    m = TEST_FAIL_RE.exec(line);
    if (m) {
      const entry = { name: m[1].trim(), pass: false, ms: parseInt(m[2], 10), reason: null };
      if (i + 1 < lines.length) {
        const nr = REASON_RE.exec(lines[i + 1]);
        if (nr) { entry.reason = nr[1].trim(); i++; }
      }
      current.tests.push(entry);
    }
    // Lines that match neither pattern (stdout, blank, etc.) are silently skipped
  }

  return suites;
}

// ─── format ───────────────────────────────────────────────────────────────────

function fmtDuration(ms) {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)} min`;
  if (ms >= 1000)  return `${(ms / 1000).toFixed(1)} s`;
  return `${ms} ms`;
}

function buildSection(data, date) {
  const { total, failed, duration, tests } = data;
  const passed = total - failed;

  const badge   = failed > 0 ? '❌' : '✅';
  const summary = failed > 0
    ? `${badge} ${failed} failed / ${passed} passed`
    : `${badge} all ${total} passed`;

  const note = tests.length < total
    ? `\n> ⚠ Vitest only printed ${tests.length} of ${total} test lines (passing suites are truncated in the output).\n`
    : '';

  const rows = tests.map((t, i) => {
    const icon   = t.pass ? '✅' : '❌';
    // Truncate very long test names so the table stays readable
    const name   = t.name.length > 90 ? `${t.name.slice(0, 87)}...` : t.name;
    const reason = t.reason ? t.reason.replace(/\|/g, '\\|') : '—';
    return `| ${i + 1} | ${name} | ${icon} | ${reason} |`;
  });

  return [
    `## Last Run`,
    ``,
    `**Date:** ${date} &nbsp;|&nbsp; **Result:** ${summary} &nbsp;|&nbsp; **Duration:** ${fmtDuration(duration)}`,
    note,
    `| # | Test | Result | Failure reason |`,
    `|---|------|:------:|----------------|`,
    ...rows,
  ].join('\n');
}

// ─── README "Suites at a glance" ──────────────────────────────────────────────

const README_SUITES_HEADING = '## Suites at a glance';

function buildReadmeTable(suites, date) {
  let totalTests  = 0;
  let totalPassed = 0;

  const rows = SUITE_META.map(({ key, name, covers }) => {
    const mdRel = SUITE_MAP[key];
    const data  = suites[key];
    if (!data) return `| ${name} | \`${mdRel.replace(/\.md$/, '.test.ts')}\` | — | — | ${covers} |`;

    const passed = data.total - data.failed;
    const badge  = data.failed === 0 ? `✅ ${data.total}/${data.total}` : `❌ ${passed}/${data.total}`;
    totalTests  += data.total;
    totalPassed += passed;
    return `| ${name} | \`${mdRel.replace(/\.md$/, '.test.ts')}\` | ${data.total} | ${badge} | ${covers} |`;
  });

  rows.push(`| **Total** | | **${totalTests}** | **${totalPassed}/${totalTests}** | |`);

  return [
    README_SUITES_HEADING,
    '',
    `| Suite | File | Tests | Last run (${date}) | What it covers |`,
    `|-------|------|------:|----------------------|----------------|`,
    ...rows,
  ].join('\n');
}

function patchReadme(suites, date) {
  const readmePath = path.join(E2E_DIR, 'README.md');
  if (!fs.existsSync(readmePath)) {
    console.warn('  ⚠  README.md not found');
    return;
  }

  let content = fs.readFileSync(readmePath, 'utf8');
  const start = content.indexOf(README_SUITES_HEADING);
  if (start === -1) {
    console.warn(`  ⚠  README.md: "${README_SUITES_HEADING}" not found`);
    return;
  }

  // Find the `\n---` separator that closes the section
  const boundary = content.indexOf('\n---', start);
  if (boundary === -1) {
    console.warn('  ⚠  README.md: closing --- not found after Suites table');
    return;
  }

  const newSection = buildReadmeTable(suites, date);
  content = content.slice(0, start) + newSection + '\n' + content.slice(boundary);
  fs.writeFileSync(readmePath, content, 'utf8');
  console.log('  ✓  README.md (Suites at a glance)');
}

// ─── patch md ─────────────────────────────────────────────────────────────────

const SECTION_HEADING = '## Last Run';

function patchMd(mdPath, section) {
  if (!fs.existsSync(mdPath)) {
    console.warn(`  ⚠  not found: ${mdPath}`);
    return;
  }

  let content = fs.readFileSync(mdPath, 'utf8');
  const idx   = content.indexOf(SECTION_HEADING);

  if (idx !== -1) {
    // Replace everything from the heading to the end of the file
    content = content.slice(0, idx).trimEnd() + '\n\n' + section + '\n';
  } else {
    // Append after a horizontal rule
    content = content.trimEnd() + '\n\n---\n\n' + section + '\n';
  }

  fs.writeFileSync(mdPath, content, 'utf8');
  console.log(`  ✓  ${path.relative(E2E_DIR, mdPath)}`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`Error: ${LOG_FILE} not found`);
    process.exit(1);
  }

  const raw    = fs.readFileSync(LOG_FILE, 'utf8');
  const suites = parseLog(raw);
  const date   = new Date().toISOString().slice(0, 10);

  console.log(`Parsed ${Object.keys(suites).length} suite(s) from last-run.log\n`);

  for (const [testPath, mdRel] of Object.entries(SUITE_MAP)) {
    const data = suites[testPath];
    if (!data) {
      console.warn(`  ⚠  no log data for: ${testPath}`);
      continue;
    }

    const label = data.failed > 0
      ? `${data.failed}/${data.total} failed`
      : `all ${data.total} passed`;
    process.stdout.write(`${testPath}  (${label})  → `);

    const section = buildSection(data, date);
    patchMd(path.join(E2E_DIR, mdRel), section);
  }

  console.log('\nUpdating README.md…');
  patchReadme(suites, date);

  console.log('\nDone.');
}

main();
