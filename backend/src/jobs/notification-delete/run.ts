/**
 * Cloud Run Job entrypoint for notification deletion.
 *
 * Triggered by Cloud Scheduler at 2:00 AM UTC daily.
 * Auto-deletes old notifications from the system.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/notificationDelete.ts.
 */
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { NotificationRepository } from '#root/shared/database/providers/mongo/repositories/NotificationRepository.js';

async function main(): Promise<void> {
  await loadAppModules('all');

  const container = getContainer();
  const notificationRepository = container.get<NotificationRepository>(
    CORE_TYPES.NotificationRepository,
  );
  await notificationRepository.autoDeleteNotifications();
  console.log('[notification-delete-job] done');
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[notification-delete-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });