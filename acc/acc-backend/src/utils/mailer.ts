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
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    auth: {
      user,
      pass,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Agri Platform" <${user}>`,
      to: email,
      subject: title,
      html,
    });
  } catch (error) {
    console.error('SMTP Mail send failed:', error);
    throw error;
  }
}
