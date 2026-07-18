#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * `npm run verify` — CI gate that fails if the expected E2E test counts
 * drift below the documented floor.  Centralises the numbers so the PR
 * template, README, and CI all agree.
 *
 * Authoritative floor values
 *   reviewer-system  ≥ 31 tests
 *                     (PR #1: 5 ErrorBoundary + 10 moderator = 15
 *                      PR #3: +9 approval/GDB/stuck/reputation = 24
 *                      PR #4: +7 queue-details/analytics = 31)
 *   web-app          ≥  7 tests   (PR #1 tightens the verifier regex; floor
 *                                 tracks reality — bump deliberately as new
 *                                 specs land)
 *   ace-web-app      ≥  7 tests   (PR #5: 7 core-query-flow tests —
 *                                 Hindi/English/AI-fallback/empty-submit/
 *                                 language-switch/history-preservation/
 *                                 double-submit)
 *
 * The Python multilingual suite (qa/tests/multilingual) is run separately
 * via pytest — see that suite's own README.  This verifier only enforces
 * the Playwright/TypeScript test floors.
 *
 * Bump the floor deliberately as new tests land; the gate exists so a
 * refactor that accidentally drops a spec fails CI rather than landing.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TESTS_DIR = path.join(__dirname, "..", "tests");
const FLOOR = { "reviewer-system": 31, "web-app": 7, "ace-web-app": 7 };

/**
 * Count only `test(…)` declarations (i.e. the *first* character after the
 * opening paren is a quote).  This deliberately excludes
 * `test.skip`, `test.step`, `test.describe`, `test.only`, and
 * `test.beforeEach`, so the floor reflects real test cases rather than
 * internal scaffolding.
 */
function countTests(suiteDir) {
  const full = path.join(TESTS_DIR, suiteDir);
  if (!fs.existsSync(full)) return 0;
  let count = 0;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".spec.ts")) {
        const body = fs.readFileSync(p, "utf8");
        count += (body.match(/^\s*test\(\s*['"`]/gm) || []).length;
      }
    }
  }
  walk(full);
  return count;
}

let failed = false;
const summary = [];
for (const [suite, floor] of Object.entries(FLOOR)) {
  const n = countTests(suite);
  const ok = n >= floor;
  summary.push(`${suite}=${n}/${floor}${ok ? " ✅" : " ❌"}`);
  if (!ok) failed = true;
}

console.log("[verify] " + summary.join("  "));
if (failed) {
  console.error(
    "[verify] ❌ At least one suite is below its documented floor. " +
      "Add tests or update FLOOR deliberately.",
  );
  process.exit(1);
}
console.log("[verify] ✅ Test counts meet or exceed documented floors.");
