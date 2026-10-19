// =============================================================================
// testing/scripts/reconcile_reputation.mjs
// -----------------------------------------------------------------------------
// Thin wrapper around ajrasakha/backend/scripts/recalculate-reputation-scores.mjs
// so that Phase-3/Phase-5 SLAs can compare live reputation_score against the
// independent re-derivation. Default = --dry-run (no writes).
//
// Run:
//   node testing/scripts/reconcile_reputation.mjs                # dry-run
//   node testing/scripts/reconcile_reputation.mjs --live        # apply changes
// =============================================================================

import { spawnSync } from 'child_process';
import { resolve } from 'path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const scriptPath = resolve(repoRoot, 'ajrasakha', 'backend', 'scripts', 'recalculate-reputation-scores.mjs');
const extra = process.argv.includes('--live') ? [] : ['--dry-run'];

const r = spawnSync('node', [scriptPath, ...extra], { stdio: 'inherit' });
process.exit(r.status ?? 1);