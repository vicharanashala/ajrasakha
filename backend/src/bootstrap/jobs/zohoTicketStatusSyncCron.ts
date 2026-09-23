import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
// The Testers Dashboard code (and its sync logic) now lives in
// testers-dashboard/backend/ - only the cron.schedule(...) registration and
// container lookup stay here (see that package's jobs/zohoTicketStatusSyncCron.ts
// for why).
import type { ZohoTicketStatusService } from '../../../../testers-dashboard/backend/build/services/ZohoTicketStatusService.js';
import { runZohoTicketStatusSync } from '../../../../testers-dashboard/backend/build/jobs/zohoTicketStatusSyncCron.js';

cron.schedule('1,31 * * * *', async () => {
    const container = getContainer();
    const zohoTicketStatusService = container.get<ZohoTicketStatusService>(
        CORE_TYPES.ZohoTicketStatusService,
    );
    await runZohoTicketStatusSync(zohoTicketStatusService);
});
