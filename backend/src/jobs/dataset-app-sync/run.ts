/**
 * Cloud Run Job entrypoint for the daily Review System -> Dataset
 * Application sync — copies the `users`, `questions`, and `answers`
 * collections from the Review System's MongoDB into the Dataset
 * Application's MongoDB so both stay consistent on a daily cadence.
 *
 * Triggered by Cloud Scheduler daily at 04:00 Asia/Kolkata.
 *
 * This job does NOT reimplement any sync logic. It reuses the existing
 * standalone script as-is (backend/scripts/sync-dataset-app.mjs), running it
 * with `--apply`. The script already reads DB_URL/DB_NAME (source) and
 * DATASET_APP_DB_URL/DATASET_APP_DB_NAME (destination) from the environment and
 * connects to both MongoDB clusters itself, so this entrypoint does not
 * touch loadAppModules()/the DI container.
 */
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

// build/jobs/dataset-app-sync/run.js -> ../../../scripts (i.e. backend/scripts,
// which the Dockerfile copies to /app/scripts alongside /app/build).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../../../scripts');

const SCRIPT = 'sync-dataset-app.mjs';

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
  console.log(`[dataset-app-sync-job] ▶ starting ${SCRIPT} --apply`);
  await runScript(SCRIPT);
  console.log('[dataset-app-sync-job] ✅ sync completed successfully');
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[dataset-app-sync-job] fatal error:', err instanceof Error ? err.message : err);
    setTimeout(() => process.exit(1), 100);
  });
