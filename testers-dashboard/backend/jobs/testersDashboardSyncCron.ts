import type { TestersDashboardService } from '../services/TestersDashboardService.js';

// Called from backend/src/bootstrap/jobs/testersDashboardSyncCron.ts, which owns the actual
// cron.schedule(...) registration and container lookup. This package can't import backend's
// getContainer() itself: backend needs this package's compiled output for its DI bindings,
// and this function would need backend's compiled output for getContainer() - a circular
// build dependency. Keeping container resolution in backend and passing the resolved service
// in here breaks that cycle.
export async function runTestersDashboardSync(
  testersDashboardService: TestersDashboardService,
): Promise<void> {
  console.log('<<CRON>> Running Testers Dashboard sheet sync...');

  try {
    await testersDashboardService.syncFromSheet();
  } catch (error) {
    console.error('<<CRON>> Error syncing Testers Dashboard sheet:', error);
  }
}
