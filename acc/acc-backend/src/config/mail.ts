import { env } from '#root/utils/env.js';

export const emailConfig = {
  EMAIL_USER: env('EMAIL_USER') || null,
  EMAIL_PASS: env('EMAIL_PASS') || null,
  NOTIFICATION_EMAIL: env('NOTIFICATION_EMAIL') || null,
  SMTP_SERVER: env('SMTP_SERVER') || env('SMTP_HOST') || 'smtppro.zoho.in',
  SMTP_PORT: Number(env('SMTP_PORT')) || 465,
};
