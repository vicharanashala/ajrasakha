import { sendEmailNotification } from '#root/utils/mailer.js';
import { appConfig } from '#root/config/app.js';

export function buildPaeAssignmentEmailHtml(
  firstName: string,
  questionTexts: string[],
): string {
  const platformUrl = appConfig.frontendUrl;
  const rows = questionTexts
    .map(
      (text, i) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${i + 1}.</td><td style="padding:6px 8px;border-bottom:1px solid #eee;">${text}</td></tr>`,
    )
    .join('');

  return `<p>Dear ${firstName || 'PAE Expert'},</p>
       <p>The following ${questionTexts.length} question(s) have been assigned to you for answering:</p>
       <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px;">
         <thead><tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">Question</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>
       <p>
         <a href="${platformUrl}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#2e7d32;color:#fff;text-decoration:none;border-radius:4px;font-family:sans-serif;font-size:14px;">
           Go to Platform
         </a>
       </p>
       <p>Thank you.</p>`;
}

export async function sendPaeAssignmentEmail(
  email: string,
  firstName: string,
  questionTexts: string[],
): Promise<void> {
  if (!questionTexts.length) return;
  const html = buildPaeAssignmentEmailHtml(firstName, questionTexts);
  await sendEmailNotification(
    email,
    `${questionTexts.length} Question(s) Assigned to You`,
    '',
    html,
  );
}
