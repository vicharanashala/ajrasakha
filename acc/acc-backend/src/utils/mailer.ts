import { emailConfig } from '#root/config/mail.js';
import nodemailer from 'nodemailer';

export async function sendEmailNotification(
  email: string | string[],
  title: string,
  message: string,
  html?: string,
) {
  const user = emailConfig.EMAIL_USER;
  const pass = emailConfig.EMAIL_PASS;
  if (!user || !pass) {
    console.warn(`⚠️ SMTP Mailer not configured. Skipping email to: ${email}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: emailConfig.SMTP_HOST,
    port: emailConfig.SMTP_PORT,
    secure: emailConfig.SMTP_SECURE,
    auth: {
      user,
      pass,
    },
  });

  const fromSender = emailConfig.EMAIL_FROM || `"Agri Platform" <${user}>`;

  try {
    await transporter.sendMail({
      from: fromSender,
      to: email,
      subject: title,
      text: message,
      html,
    });
  } catch (error) {
    console.error('SMTP Mail send failed:', error);
    throw error;
  }
}

