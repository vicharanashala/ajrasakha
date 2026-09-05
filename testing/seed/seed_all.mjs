// =============================================================================
// testing/seed/seed_all.mjs
// -----------------------------------------------------------------------------
// Orchestrates the seed in the correct order:
//   1. seed_users.mjs          (writes to users collection)
//   2. register_firebase_users (creates matching Auth Emulator users)
//   3. seed_questions.mjs      (writes to questions + question_submissions)
//
// Idempotent: each script wipes loadtest-only docs first.
//
// Usage:
//   node testing/seed/seed_all.mjs
// =============================================================================

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTING   = resolve(__dirname, '..');

function run(label, script, env = {}) {
  console.log(`\n=== ${label} (${script}) ===`);
  const r = spawnSync('node', [resolve(__dirname, script)], {
    cwd: TESTING,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    console.error(`✗ ${label} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

run('seed users',     'seed_users.mjs',                    { EXPERTS: '200', PAE_EXPERTS: '50', MODERATORS: '50', GATE_KEEPERS: '20', AUDITORS: '20' });
run('register Firebase users', 'register_firebase_users.mjs', { FIREBASE_EMULATOR_HOST: 'localhost:9099' });
run('seed questions', 'seed_questions.mjs',               { QUESTIONS: '5000' });

console.log('\n✓ all seeds complete');
