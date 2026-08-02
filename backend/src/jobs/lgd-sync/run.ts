/**
 * Cloud Run Job entrypoint for syncing LGD (Local Government Directory)
 * reference data — states, districts, blocks, and villages — into MongoDB.
 *
 * Triggered by Cloud Scheduler weekly (Sunday 03:00 Asia/Kolkata). LGD
 * administrative boundaries change rarely, so a weekly cadence keeps the
 * data fresh without hammering the external data.gov.in API.
 *
 * This job does NOT reimplement any sync logic. It reuses the existing
 * standalone scripts as-is (backend/scripts/create-lgd-*-collection.mjs),
 * running each with `--apply`, one after another, in the order the data
 * dependency requires:
 *
 *   1. states     — create-lgd-states-collection.mjs
 *   2. districts  — create-lgd-districts-collection.mjs (needs states)
 *   3. blocks     — create-lgd-blocks-collection.mjs     (needs districts)
 *   4. villages   — create-lgd-villages-collection.mjs   (needs blocks, reads
 *                    the `blocks` collection written by step 3)
 *
 * Each step must exit 0 before the next one starts. If a step exits non-zero
 * (or fails to spawn), the job stops immediately — later steps are skipped —
 * and this process exits non-zero so Cloud Run reports the execution as
 * failed. All four scripts already read DB_URL / DB_NAME and the LGD_* API
 * config from the environment and connect to Mongo themselves, so this
 * entrypoint does not touch loadAppModules()/the DI container.
 */
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

// build/jobs/lgd-sync/run.js -> ../../../scripts (i.e. backend/scripts, which
// the Dockerfile copies to /app/scripts alongside /app/build).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../../../scripts');

const STEPS: Array<{name: string; script: string}> = [
  {name: 'states', script: 'create-lgd-states-collection.mjs'},
  {name: 'districts', script: 'create-lgd-districts-collection.mjs'},
  {name: 'blocks', script: 'create-lgd-blocks-collection.mjs'},
  {name: 'villages', script: 'create-lgd-villages-collection.mjs'},
];

function runScript(scriptFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptFile);
    const child = spawn('node', [scriptPath, '--apply'], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', err => {
      reject(new Error(`Failed to start ${scriptFile}: ${err.message}`));
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${scriptFile} exited with code ${code}${signal ? ` (signal ${signal})` : ''}`,
          ),
        );
      }
    });
  });
}

async function main(): Promise<void> {
  for (const step of STEPS) {
    console.log(`[lgd-sync-job] ▶ starting step "${step.name}" (${step.script} --apply)`);
    await runScript(step.script);
    console.log(`[lgd-sync-job] ✅ finished step "${step.name}"`);
  }
  console.log('[lgd-sync-job] all steps completed successfully');
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[lgd-sync-job] fatal error:', err instanceof Error ? err.message : err);
    setTimeout(() => process.exit(1), 100);
  });
