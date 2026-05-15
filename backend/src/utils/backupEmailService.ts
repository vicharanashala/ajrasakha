import {emailConfig} from '#root/config/mail.js';
import {
  buildBackupEmailTemplate,
  buildDailyStatsEmailTemplate,
} from './buildBackupEmailTemplate.js';
import { buildBackupFailureTemplate } from './buildBackupFailureTemplate.js';
import {getDailyStats} from './getDailyStats.js';
import {sendEmailNotification} from './mailer.js';

export async function sendBackupSuccessEmail(results: {db: string; publicUrl: string | null; status: 'success' | 'failed' | 'Already exists'; error?: any; timestamp?: string}[]) {
  const timestamp = new Date().toISOString();

  // const recipient = emailConfig.BACKUP_NOTIFICATION_EMAIL;
  const recipient = emailConfig.BACKUP_NOTIFICATION_EMAIL?.split(',')
    .map(e => e.trim())
    .filter(Boolean)[0]; 
  const title = 'MongoDB Backup Stats';
  const stats = await getDailyStats();
  const template = buildBackupEmailTemplate(timestamp, results, stats);

  await sendEmailNotification(recipient, title, '', template);
}

export async function sendStatsEmail(adminEmail?: string) {
  let recipients: string[] = [];
  if (adminEmail) {
    recipients = [adminEmail];
  } else {
    recipients = emailConfig.BACKUP_NOTIFICATION_EMAIL?.split(',')
      .map(email => email.trim())
      .filter(Boolean);
  }
  const stats = await getDailyStats();
  const template = buildDailyStatsEmailTemplate(stats);
  const title = 'Daily Question Review System Report';

  await sendEmailNotification(recipients, title, '', template);
}

export async function sendBackupFailureEmail(dbName: string, error: any) {
  const recipient = emailConfig.BACKUP_NOTIFICATION_EMAIL;
  const title = `MongoDB Backup Failed for ${dbName}`;
  const template = buildBackupFailureTemplate(
    dbName,
    error
  );
  await sendEmailNotification(recipient, title, '', template);
}
