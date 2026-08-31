import { emailConfig } from '#root/config/mail.js';
import nodemailer from 'nodemailer';

/**
 * Parse NOTIFICATION_EMAIL env var into a list of email addresses.
 */
export function getNotificationEmails(): string[] {
  const notifEmail = emailConfig.NOTIFICATION_EMAIL || '';
  if (!notifEmail) {
    return [];
  }
  return notifEmail
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

/**
 * Send email notification matching the HuggingFace Sync email service pattern.
 *
 * @param email - Target email address, list of emails, or omit/null to send to NOTIFICATION_EMAIL.
 * @param title - Subject of the email.
 * @param message - Plain text content.
 * @param html - Optional HTML body.
 */
export async function sendEmailNotification(
  email?: string | string[] | null,
  title: string = '',
  message: string = '',
  html?: string,
): Promise<boolean> {
  const user = emailConfig.EMAIL_USER;
  const pass = emailConfig.EMAIL_PASS;

  if (!user || !pass) {
    console.warn('⚠️ [EMAIL] Configuration missing. Set EMAIL_USER and EMAIL_PASS in .env');
    return false;
  }

  let recipientEmails: string[] = [];

  if (Array.isArray(email)) {
    recipientEmails = email.map((e) => e.trim()).filter(Boolean);
  } else if (typeof email === 'string' && email.trim()) {
    recipientEmails = [email.trim()];
  } else {
    recipientEmails = getNotificationEmails();
  }

  if (recipientEmails.length === 0) {
    console.warn('⚠️ [EMAIL] No notification emails configured. Set NOTIFICATION_EMAIL in .env');
    return false;
  }

  const fromSender = `"Annam Call Center" <${user}>`;
  const smtpServer = emailConfig.SMTP_SERVER || 'smtppro.zoho.in';
  const smtpPort = emailConfig.SMTP_PORT || 465;

  // Create transporter with default Zoho SMTP configuration
  const transporter = nodemailer.createTransport({
    host: smtpServer,
    port: smtpPort,
    secure: true,
    auth: {
      user,
      pass,
    },
  });

  try {
    await transporter.sendMail({
      from: fromSender,
      to: recipientEmails,
      subject: title,
      text: message,
      html,
    });
    console.log(`✉️ [EMAIL] Notification sent successfully to: ${recipientEmails.join(', ')}`);
    return true;
  } catch (error: any) {
    console.warn(`⚠️ [EMAIL] Primary SMTP (${smtpServer}) failed: ${error.message}. Retrying with smtp.zoho.in fallback...`);
    try {
      const fallbackTransporter = nodemailer.createTransport({
        host: 'smtp.zoho.in',
        port: 465,
        secure: true,
        auth: {
          user,
          pass,
        },
      });
      await fallbackTransporter.sendMail({
        from: fromSender,
        to: recipientEmails,
        subject: title,
        text: message,
        html,
      });
      console.log(`✉️ [EMAIL] Notification sent successfully via fallback to: ${recipientEmails.join(', ')}`);
      return true;
    } catch (fallbackErr: any) {
      console.error('❌ [EMAIL] Failed to send email notification:', fallbackErr.message || fallbackErr);
      return false;
    }
  }
}
