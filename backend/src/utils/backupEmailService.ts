import {emailConfig} from '#root/config/mail.js';
import {buildBackupEmailTemplate} from './buildBackupEmailTemplate.js';
import {getDailyStats} from './getDailyStats.js';
import {sendEmailNotification} from './mailer.js';

export async function sendBackupSuccessEmail(publicUrl: string) {
  const timestamp = new Date().toISOString();

  const recipient = emailConfig.BACKUP_NOTIFICATION_EMAIL;
  const title = 'MongoDB Backup Successful';
  const stats = await getDailyStats();
  const template = buildBackupEmailTemplate(timestamp, publicUrl, stats);

  await sendEmailNotification(recipient, title, '', template);
}
