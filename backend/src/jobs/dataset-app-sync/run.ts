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
import {appConfig} from '#root/config/app.js';

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

function buildEmailTemplate(title: string, message: string, details: string, isError: boolean = false): string {
  const platformUrl = appConfig.frontendUrl;
  const color = isError ? '#d32f2f' : '#2e7d32';
  const bgColor = isError ? '#fff5f5' : '#f8fdf8';
  return `
    <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; color: #333; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
      <div style="text-align: center; padding: 20px 0; background-color: ${bgColor}; border-bottom: 2px solid ${color};">
        <img src="${platformUrl}/annam-logo.png" alt="Annam.ai Logo" style="height: 70px;" />
      </div>
      <div style="padding: 30px 20px;">
        <h2 style="color: ${color}; margin-top: 0; text-align: center;">${title}</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello,</p>
        <p style="font-size: 16px; line-height: 1.5;">${message}</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid ${color}; overflow-x: auto;">
          <pre style="margin: 0; font-family: monospace; font-size: 13px; color: #333; white-space: pre-wrap;">${details}</pre>
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
          <a href="${platformUrl}" style="display:inline-block; padding: 12px 24px; background-color: #2e7d32; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
            Go to AjraSakha Platform
          </a>
        </div>
      </div>
      <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 13px; color: #666; border-top: 1px solid #ddd;">
        <p style="margin: 0;">Regards,</p>
        <p style="margin: 5px 0 0 0;"><strong>Ajrasakha System</strong></p>
        <p style="margin: 15px 0 0 0; font-size: 11px; color: #999;">&copy; ${new Date().getFullYear()} Annam.ai. All rights reserved.</p>
      </div>
    </div>
  `;
}

async function main(): Promise<void> {
  console.log(`[dataset-app-sync-job] ▶ starting ${SCRIPT} --apply`);
  const emailTo = process.env.BACKUP_NOTIFICATION_EMAIL;
  try {
    const output = await runScript(SCRIPT);
    console.log('[dataset-app-sync-job] ✅ sync completed successfully');
    
    if (emailTo) {
      const html = buildEmailTemplate(
        'Dataset Sync Report',
        'The daily sync from GDB to the Dataset Application completed <strong>successfully</strong>.',
        output
      );
      await sendEmailNotification(emailTo, 'Dataset App Sync - Success', '', html);
      console.log(`[dataset-app-sync-job] 📧 Success email sent to ${emailTo}`);
    }
  } catch (err) {
    if (emailTo) {
      const details = err instanceof Error ? err.message : String(err);
      const html = buildEmailTemplate(
        'Dataset Sync Alert',
        'The daily sync from GDB to the Dataset Application <strong style="color: #d32f2f;">FAILED</strong>.',
        details,
        true
      );
      await sendEmailNotification(emailTo, 'Dataset App Sync - FAILED', '', html)
        .catch(e => console.error('[dataset-app-sync-job] Failed to send error email', e));
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
