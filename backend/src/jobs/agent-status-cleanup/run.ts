/**
 * Cloud Run Job entrypoint for agent status cleanup.
 *
 * Triggered by Cloud Scheduler every 1 minute (Asia/Kolkata).
 * Cleans up inactive agents from the system.
 *
 * Replaces the in-process node-cron in bootstrap/jobs/agentStatusCleanupJob.ts.
 */
import { getContainer, loadAppModules } from '../../bootstrap/loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { UserService } from '#root/modules/user/services/UserService.js';

async function main(): Promise<void> {
  await loadAppModules('all');

  const container = getContainer();
  const userService = container.get<UserService>(GLOBAL_TYPES.UserService);
  await userService.cleanupInactiveAgents();
  console.log('[agent-status-cleanup-job] done');
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[agent-status-cleanup-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });