import { env } from '#root/utils/env.js';

export const emailConfig = {
  BACKUP_NOTIFICATION_EMAIL: env('BACKUP_NOTIFICATION_EMAIL') || null,
  EMAIL_USER: env('EMAIL_USER') || null,
  EMAIL_PASS: env('EMAIL_PASS') || null,
  SMTP_HOST: env('SMTP_HOST') || 'smtp.zoho.in',
  SMTP_PORT: Number(env('SMTP_PORT')) || 465,
  SMTP_SECURE: env('SMTP_SECURE') !== 'false',
  EMAIL_FROM: env('EMAIL_FROM') || null,
};

