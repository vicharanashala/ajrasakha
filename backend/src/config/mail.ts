import {env} from '#root/utils/env.js';

export const emailConfig = {
  BACKUP_NOTIFICATION_EMAIL: env('BACKUP_NOTIFICATION_EMAIL') || null,
  EMAIL_USER: env('EMAIL_USER') || null,
  EMAIL_PASS: env('EMAIL_PASS') || null,
};
