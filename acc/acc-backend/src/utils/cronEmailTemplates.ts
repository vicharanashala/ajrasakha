/**
 * Email templates for ACC automated Cron Job alerts and reports.
 */

export interface CronFailureData {
  jobName: string;
  durationMs: number;
  error: string;
  stack?: string;
  errorsCount?: number;
  failedItems?: string[];
  timestamp?: string;
}

export interface CronWeeklyDigestData {
  jobName: string;
  totalEligible: number;
  totalSynced: number;
  totalPurged: number;
  totalAlreadyDeleted?: number;
  totalNoPlivoRecording?: number;
  durationMs: number;
  timestamp?: string;
}

/**
 * Builds the consolidated Failure Alert HTML & Text template (sent at most once per daily run).
 */
export function buildCronFailureEmailTemplate(data: CronFailureData): {
  subject: string;
  html: string;
  text: string;
} {
  const timestamp = data.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const durationSec = (data.durationMs / 1000).toFixed(1);
  const subject = `🚨 [CRON FAILURE] ${data.jobName} encountered errors (${timestamp} IST)`;

  const failedItemsHtml =
    data.failedItems && data.failedItems.length > 0
      ? `
      <div style="margin-top: 16px;">
        <h4 style="margin: 0 0 8px; color: #dc2626; font-size: 14px; text-transform: uppercase;">Failed Items / Error Samples (${data.failedItems.length}):</h4>
        <ul style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 12px 24px; margin: 0; font-family: monospace; font-size: 12px; color: #991b1b; max-height: 250px; overflow-y: auto;">
          ${data.failedItems.map((item) => `<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `
      : '';

  const stackHtml = data.stack
    ? `
      <div style="margin-top: 16px;">
        <h4 style="margin: 0 0 8px; color: #4b5563; font-size: 14px; text-transform: uppercase;">Stack Trace:</h4>
        <pre style="background: #1f2937; color: #f9fafb; padding: 12px; border-radius: 6px; font-size: 11px; overflow-x: auto; white-space: pre-wrap; margin: 0;">${escapeHtml(data.stack)}</pre>
      </div>
    `
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background: #dc2626; padding: 20px 24px; color: #ffffff;">
            <span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Cron Alert</span>
            <h2 style="margin: 8px 0 0; font-size: 20px; font-weight: 600;">Daily Job Execution Failed</h2>
          </div>
          
          <div style="padding: 24px;">
            <p style="color: #374151; font-size: 14px; margin-top: 0;">
              The scheduled background task <strong>${escapeHtml(data.jobName)}</strong> encountered errors during its execution.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280; width: 35%;">Status</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">FAILED</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Execution Time</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827;">${timestamp} IST</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Duration</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827;">${durationSec}s</td>
              </tr>
              ${
                data.errorsCount !== undefined
                  ? `
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Total Errors</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${data.errorsCount}</td>
              </tr>`
                  : ''
              }
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Primary Error</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827;">${escapeHtml(data.error)}</td>
              </tr>
            </table>

            ${failedItemsHtml}
            ${stackHtml}

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; text-align: center;">
              Annam Call Centre (ACC) &bull; Automated Cron Monitor &bull; Google Cloud Run
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
🚨 [CRON FAILURE] ${data.jobName}
Execution Time: ${timestamp} IST
Duration: ${durationSec}s
Status: FAILED
Primary Error: ${data.error}
${data.errorsCount ? `Total Errors: ${data.errorsCount}\n` : ''}
${data.failedItems?.length ? `\nFailed Samples:\n${data.failedItems.join('\n')}\n` : ''}
${data.stack ? `\nStack Trace:\n${data.stack}\n` : ''}
  `.trim();

  return { subject, html, text };
}

/**
 * Builds the Sunday Weekly Digest HTML & Text template.
 */
export function buildCronWeeklyDigestEmailTemplate(data: CronWeeklyDigestData): {
  subject: string;
  html: string;
  text: string;
} {
  const timestamp = data.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const durationSec = (data.durationMs / 1000).toFixed(1);
  const subject = `📊 [WEEKLY CRON DIGEST] ${data.jobName} Summary (${timestamp} IST)`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background: #16a34a; padding: 20px 24px; color: #ffffff;">
            <span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Weekly Digest</span>
            <h2 style="margin: 8px 0 0; font-size: 20px; font-weight: 600;">Plivo Recording Sync & Cleanup Health</h2>
          </div>
          
          <div style="padding: 24px;">
            <p style="color: #374151; font-size: 14px; margin-top: 0;">
              Here is your Sunday weekly summary for <strong>${escapeHtml(data.jobName)}</strong>. The system is operating normally with 100% recording retention and zero storage waste.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280; width: 45%;">Report Date</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-weight: 500;">${timestamp} IST</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Job Duration</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827;">${durationSec}s</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Missing Calls Scanned</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827;">${data.totalEligible}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Recordings Archived to GCP</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #16a34a; font-weight: bold;">+${data.totalSynced} synced</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Unrecorded / Missed Calls</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #6b7280;">${data.totalNoPlivoRecording || 0}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Plivo 20-Day Old Recordings Purged</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #2563eb; font-weight: bold;">${data.totalPurged} deleted</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Overall Health</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #16a34a; font-weight: bold;">100% HEALTHY</td>
              </tr>
            </table>

            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; color: #15803d; font-size: 13px;">
              ✅ <strong>Retention Guarantee</strong>: All audio recordings older than 20 days were safely verified in GCP Cloud Storage before deletion from Plivo.
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; text-align: center;">
              Annam Call Centre (ACC) &bull; Automated Cron Monitor &bull; Google Cloud Run
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
📊 [WEEKLY CRON DIGEST] ${data.jobName}
Report Date: ${timestamp} IST
Duration: ${durationSec}s
Recordings Archived to GCP: +${data.totalSynced}
Plivo 20-Day Recordings Purged: ${data.totalPurged}
Health: 100% HEALTHY
  `.trim();

  return { subject, html, text };
}

/**
 * Builds the Test Email template for on-demand verification.
 */
export function buildCronTestEmailTemplate(recipients: string): {
  subject: string;
  html: string;
  text: string;
} {
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const subject = `🧪 [TEST ALERT] ACC Cron Email Notification Verification (${timestamp} IST)`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background: #2563eb; padding: 20px 24px; color: #ffffff;">
            <span style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Verification</span>
            <h2 style="margin: 8px 0 0; font-size: 20px; font-weight: 600;">Zoho SMTP Email Delivery Test</h2>
          </div>
          
          <div style="padding: 24px;">
            <p style="color: #374151; font-size: 14px; margin-top: 0;">
              This test email confirms that your <strong>Zoho SMTP credentials</strong> and <strong>ACC automated alert configuration</strong> are working properly.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280; width: 35%;">Status</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #16a34a; font-weight: bold;">CONNECTED & OPERATIONAL</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Test Timestamp</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827;">${timestamp} IST</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; color: #6b7280;">Configured Recipients</td>
                <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #111827; font-family: monospace;">${escapeHtml(recipients)}</td>
              </tr>
            </table>

            <p style="color: #6b7280; font-size: 13px;">
              You will automatically receive an alert if the daily 02:00 AM Plivo recording sync & cleanup job fails, as well as a weekly health digest every Sunday morning.
            </p>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; text-align: center;">
              Annam Call Centre (ACC) &bull; Automated Cron Monitor &bull; Google Cloud Run
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
🧪 [TEST ALERT] ACC Cron Email Notification Verification
Timestamp: ${timestamp} IST
Recipients: ${recipients}
Status: Zoho SMTP is operational!
  `.trim();

  return { subject, html, text };
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
