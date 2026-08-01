import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { TestersDashboardService } from '#root/modules/dashboard/services/TestersDashboardService.js';

cron.schedule('*/30 * * * *', async () => {
    console.log('<<CRON>> Running Testers Dashboard sheet sync...');

    try {
        const container = getContainer();
        const testersDashboardService = container.get<TestersDashboardService>(
            CORE_TYPES.TestersDashboardService,
        );
        await testersDashboardService.syncFromSheet();
    } catch (error) {
        console.error('<<CRON>> Error syncing Testers Dashboard sheet:', error);
    }
});