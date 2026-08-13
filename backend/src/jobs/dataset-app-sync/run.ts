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
import {sendEmailNotification} from '#root/utils/mailer.js';

// build/jobs/dataset-app-sync/run.js -> ../../../scripts (i.e. backend/scripts,
// which the Dockerfile copies to /app/scripts alongside /app/build).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, '../../../scripts');

const SCRIPT = 'sync-dataset-app.mjs';

function runScript(scriptFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptFile);
    const child = spawn('node', [scriptPath, '--apply'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let output = '';

    child.stdout?.on('data', data => {
      process.stdout.write(data);
      output += data.toString();
    });

    child.stderr?.on('data', data => {
      process.stderr.write(data);
      output += data.toString();
    });

    child.on('error', err => {
      reject(new Error(`Failed to start ${scriptFile}: ${err.message}\n\nOutput:\n${output}`));
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(
          new Error(
            `${scriptFile} exited with code ${code}${signal ? ` (signal ${signal})` : ''}\n\nOutput:\n${output}`,
          ),
        );
      }
    });
  });
}

async function main(): Promise<void> {
  console.log(`[dataset-app-sync-job] ▶ starting ${SCRIPT} --apply`);
  const emailTo = process.env.BACKUP_NOTIFICATION_EMAIL;
  try {
    const output = await runScript(SCRIPT);
    console.log('[dataset-app-sync-job] ✅ sync completed successfully');
    
    if (emailTo) {
      await sendEmailNotification(
        emailTo,
        'Dataset App Sync - Success',
        '',
        `<p>The daily sync from Review System to Dataset Application completed successfully.</p><pre>${output}</pre>`
      );
      console.log(`[dataset-app-sync-job] 📧 Success email sent to ${emailTo}`);
    }
  } catch (err) {
    if (emailTo) {
      await sendEmailNotification(
        emailTo,
        'Dataset App Sync - FAILED',
        '',
        `<p>The daily sync from Review System to Dataset Application <b>FAILED</b>.</p><pre>${err instanceof Error ? err.message : String(err)}</pre>`
      ).catch(e => console.error('[dataset-app-sync-job] Failed to send error email', e));
    }
    throw err;
  }
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[dataset-app-sync-job] fatal error:', err instanceof Error ? err.message : err);
    setTimeout(() => process.exit(1), 100);
  });
