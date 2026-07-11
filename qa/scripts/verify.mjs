#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * `npm run verify` — CI gate that fails if the expected E2E test counts
 * drift below the documented floor.  Centralises the numbers so the PR
 * template, README, and CI all agree.
 *
 * Authoritative floor values
 *   reviewer-system  ≥ 12 tests
 *   web-app          ≥ 12 tests
 *
 * The Python multilingual suite (qa/tests/multilingual) is run separately
 * via pytest — see that suite's own README.  This verifier only enforces
 * the Playwright/TypeScript test floors.
 *
 * The script also prints a one-line summary that the workflow surfaces
 * in the PR comment.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TESTS_DIR = path.join(__dirname, "..", "tests");
const FLOOR = { "reviewer-system": 12, "web-app": 12 };

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
        // Match `test(` or `test.describe(` declarations, including
        // arrow-function forms.
        count += (body.match(/^\s*test[.(]/gm) || []).length;
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
