#!/usr/bin/env node
/**
 * E2E failure report — run automatically after every `pnpm test:e2e` (and
 * `pnpm test:e2e:code-coverage`).
 *
 * Parses src/e2e/last-run.log for the "Failed Tests N" section, classifies
 * each failure against scripts/known-e2e-failures.json (kept in sync with
 * src/e2e/Failed_tests.md), and does two things every run:
 *
 *   1. Writes a fresh src/e2e/last-run-failures.md — so "what failed, and
 *      is it new" is always answered by one file, without re-reading the
 *      full vitest log by hand.
 *   2. Updates the auto-managed "Newly detected failures" section inside
 *      Failed_tests.md itself (between the AUTO-TRIAGE markers) so that
 *      file can never silently drift out of sync with reality — any
 *      failure not yet triaged into a hand-written section always shows up
 *      there automatically, with no manual edit required. Root-cause
 *      write-ups still have to be authored by a person (or an AI session)
 *      that reads the code; this script only guarantees nothing new goes
 *      unnoticed. Once a failure is triaged — its write-up moved into the
 *      right hand-written section above and a matching entry added to
 *      known-e2e-failures.json — it stops appearing here automatically.
 *
 * Usage:
 *   node scripts/e2e-failure-report.mjs
 *   node scripts/e2e-failure-report.mjs --log path/to/other.log
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const logFlagIdx = args.indexOf('--log');
const LOG_PATH = logFlagIdx !== -1 ? args[logFlagIdx + 1] : join(ROOT, 'src', 'e2e', 'last-run.log');
const OUT_PATH = join(ROOT, 'src', 'e2e', 'last-run-failures.md');
const KNOWN_PATH = join(__dirname, 'known-e2e-failures.json');
const FAILED_TESTS_PATH = join(ROOT, 'src', 'e2e', 'Failed_tests.md');

const AUTO_START = '<!-- AUTO-TRIAGE:START — managed by scripts/e2e-failure-report.mjs, do not hand-edit this block -->';
const AUTO_END = '<!-- AUTO-TRIAGE:END -->';

if (!existsSync(LOG_PATH)) {
  console.error(`[e2e-failure-report] No log found at ${LOG_PATH} — nothing to report.`);
  process.exit(0);
}

const log = readFileSync(LOG_PATH, 'utf8');
const known = JSON.parse(readFileSync(KNOWN_PATH, 'utf8')).entries;

// --- Parse summary line: "Test Files  N failed | M passed (T)" / "Tests  N failed | M passed (T)"
function parseSummary(label) {
  const re = new RegExp(String.raw`${label}\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed\s*\((\d+)\)`);
  const m = log.match(re);
  if (!m) return null;
  return { failed: Number(m[1] || 0), passed: Number(m[2]), total: Number(m[3]) };
}
const testFiles = parseSummary('Test Files');
const tests = parseSummary('Tests');

const durationMatch = log.match(/Duration\s+([\d.]+s)/);
const duration = durationMatch ? durationMatch[1] : 'unknown';

// --- Parse the "Failed Tests N" block: each failure starts with " FAIL  <path> > <breadcrumb>",
// followed by an error message on the next non-empty line, and the block ends at the final
// summary section.
const failedSectionMatch = log.match(/⎯+\s*Failed Tests\s+\d+\s*⎯+([\s\S]*?)\n\s*Test Files\s+/);
const failures = [];
if (failedSectionMatch) {
  const body = failedSectionMatch[1];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*FAIL\s+(\S+)\s+>\s+(.+)$/);
    if (m) {
      let errorSnippet = '';
      for (let j = i + 1; j < lines.length && j < i + 5; j++) {
        const candidate = lines[j].trim();
        if (candidate) {
          errorSnippet = candidate.slice(0, 200);
          break;
        }
      }
      failures.push({ file: m[1], breadcrumb: m[2].trim(), errorSnippet });
    }
  }
}

function classify(failure) {
  for (const entry of known) {
    if (!failure.file.includes(entry.file)) continue;
    const allPresent = entry.contains.every(sub => failure.breadcrumb.includes(sub));
    if (allPresent) return entry;
  }
  return null;
}

const classified = failures.map(f => ({ ...f, match: classify(f) }));
const newFailures = classified.filter(f => !f.match);
const known_ = classified.filter(f => f.match);

const categoryLabel = {
  'real-bug': 'Documented real bug',
  flaky: 'Documented flaky (connection-pool / network)',
};

// DD-MM-YYYY / HH:MM:SS — easy to read at a glance, no timezone-offset math required.
function pad2(n) { return String(n).padStart(2, '0'); }
function formatDateTime(date) {
  const d = pad2(date.getDate());
  const mo = pad2(date.getMonth() + 1);
  const y = date.getFullYear();
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  return `${d}-${mo}-${y} ${h}:${mi}:${s}`;
}
function formatDate(date) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}

const nowDate = new Date();
const now = formatDateTime(nowDate);
const lines = [];
lines.push('# Last E2E Run — Failure Report');
lines.push('');
lines.push(`Generated: ${now}`);
lines.push('');
lines.push(`**Tests:** ${tests ? `${tests.passed}/${tests.total} passed, ${tests.failed} failed` : 'unknown'}`);
lines.push(`**Test files:** ${testFiles ? `${testFiles.passed}/${testFiles.total} passed, ${testFiles.failed} failed` : 'unknown'}`);
lines.push(`**Duration:** ${duration}`);
lines.push('');

if (failures.length === 0) {
  lines.push('✅ No failures this run.');
} else {
  if (newFailures.length > 0) {
    lines.push(`## ⚠️ ${newFailures.length} NEW / unexpected failure(s) — not in \`scripts/known-e2e-failures.json\``);
    lines.push('');
    lines.push('These do not match anything documented in `Failed_tests.md`. Investigate before assuming they\'re safe to ignore.');
    lines.push('');
    for (const f of newFailures) {
      lines.push(`- **${f.file}**`);
      lines.push(`  ${f.breadcrumb}`);
    }
    lines.push('');
  }

  if (known_.length > 0) {
    lines.push(`## ${known_.length} known failure(s) — matches \`Failed_tests.md\``);
    lines.push('');
    for (const f of known_) {
      lines.push(`- [${categoryLabel[f.match.category] || f.match.category}] **${f.file}**`);
      lines.push(`  ${f.breadcrumb}`);
    }
    lines.push('');
  }
}

lines.push('---');
lines.push('');
lines.push('See `Failed_tests.md` for root cause, fix suggestions, and reproduction commands for the documented failures above.');
lines.push('');
lines.push(`Source log: \`${LOG_PATH.replace(ROOT + '/', '')}\``);
lines.push('');

writeFileSync(OUT_PATH, lines.join('\n'));

// --- Update the auto-managed "Newly detected failures" block inside Failed_tests.md,
// so that file reflects the latest run automatically. This only ever adds/refreshes the
// block between the AUTO-TRIAGE markers — every hand-written section (root causes, fix
// suggestions, the flaky/disabled write-ups) is left untouched.
if (existsSync(FAILED_TESTS_PATH)) {
  const failedTestsMd = readFileSync(FAILED_TESTS_PATH, 'utf8');

  const triageLines = [];
  triageLines.push(AUTO_START);
  triageLines.push('');
  triageLines.push('## Newly detected failures — needs triage');
  triageLines.push('');
  triageLines.push(
    `*Auto-updated after every \`pnpm run test:e2e\` / \`pnpm run test:e2e:code-coverage\` run (last: ${now}). Entries below failed in the most recent run and don't match anything in \`scripts/known-e2e-failures.json\` yet. To triage one: figure out whether it's a real bug, flaky, or needs disabling (same process as every other entry in this file), write it up in the right section above, and add a matching entry to \`known-e2e-failures.json\` — it will then stop appearing here.*`,
  );
  triageLines.push('');
  if (newFailures.length === 0) {
    triageLines.push('None as of the last run — every failure matched a documented entry.');
  } else {
    for (const f of newFailures) {
      triageLines.push(`### \`${f.file}\``);
      triageLines.push('');
      triageLines.push(`- **Test:** *"${f.breadcrumb}"*`);
      if (f.errorSnippet) triageLines.push(`- **Error:** \`${f.errorSnippet}\``);
      triageLines.push(`- **First seen (auto-detected):** ${formatDate(nowDate)}`);
      triageLines.push('');
    }
  }
  triageLines.push(AUTO_END);

  const block = triageLines.join('\n');
  const markerRe = new RegExp(
    `${AUTO_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${AUTO_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  );

  let updatedMd;
  if (markerRe.test(failedTestsMd)) {
    updatedMd = failedTestsMd.replace(markerRe, block);
  } else {
    // First run with this tooling — insert the block right after the intro
    // paragraph (before the first `---`), so it's visible near the top.
    const firstDivider = failedTestsMd.indexOf('\n---\n');
    if (firstDivider !== -1) {
      updatedMd =
        failedTestsMd.slice(0, firstDivider + '\n---\n'.length) +
        '\n' + block + '\n\n---\n' +
        failedTestsMd.slice(firstDivider + '\n---\n'.length);
    } else {
      updatedMd = failedTestsMd + '\n\n---\n\n' + block + '\n';
    }
  }

  if (updatedMd !== failedTestsMd) {
    writeFileSync(FAILED_TESTS_PATH, updatedMd);
  }
}

// Console summary
console.log('');
console.log(`[e2e-failure-report] ${tests ? `${tests.passed}/${tests.total} tests passed` : 'summary unavailable'} — report written to src/e2e/last-run-failures.md`);
if (newFailures.length > 0) {
  console.log(`[e2e-failure-report] ⚠️  ${newFailures.length} NEW failure(s) not in known-e2e-failures.json:`);
  for (const f of newFailures) {
    console.log(`  - ${f.file} > ${f.breadcrumb}`);
  }
} else if (failures.length > 0) {
  console.log(`[e2e-failure-report] All ${failures.length} failure(s) match documented entries in Failed_tests.md.`);
}
console.log('');
