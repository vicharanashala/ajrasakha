import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
// The Testers Dashboard code (and its sync logic) now lives in
// testers-dashboard/backend/ - only the cron.schedule(...) registration and
// container lookup stay here (see that package's jobs/testersDashboardSyncCron.ts
// for why).
import type { TestersDashboardService } from '../../../../testers-dashboard/backend/build/services/TestersDashboardService.js';
import { runTestersDashboardSync } from '../../../../testers-dashboard/backend/build/jobs/testersDashboardSyncCron.js';

// Testers Dashboard sheet sync cron is disabled on the backend server to ensure
// 0 RAM and 0 heap overhead on resource-constrained containers.
// Google Sheet analytics are offloaded to client-side in-browser processing.
// cron.schedule('*/30 * * * *', async () => {
//     const container = getContainer();
//     const testersDashboardService = container.get<TestersDashboardService>(
//         CORE_TYPES.TestersDashboardService,
//     );
//     await runTestersDashboardSync(testersDashboardService);
// });
