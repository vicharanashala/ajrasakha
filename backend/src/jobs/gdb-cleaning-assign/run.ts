/**
 * Cloud Run Job entrypoint for the GDB Cleaning assignment.
 *
 * Run by Cloud Scheduler every hour (Asia/Kolkata). It takes back the untouched answers of
 * reviewers who have been quiet for days, all the answers of reviewers who are gone or blocked,
 * and tops up the other reviewers to 50.
 */
import {getContainer, loadAppModules} from '../../bootstrap/loadModules.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {IGdbCleaningService} from '#root/modules/gdbCleaning/interfaces/IGdbCleaningService.js';

async function main(): Promise<void> {
  await loadAppModules('all');

  const container = getContainer();
  const service = container.get<IGdbCleaningService>(GLOBAL_TYPES.GdbCleaningService);
  const result = await service.runAssignmentCron();
  console.log(
    `[gdb-cleaning-assign-job] done: released=${result.released}, toppedUp=${result.toppedUp}`,
  );
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('[gdb-cleaning-assign-job] fatal error:', err);
    setTimeout(() => process.exit(1), 100);
  });
