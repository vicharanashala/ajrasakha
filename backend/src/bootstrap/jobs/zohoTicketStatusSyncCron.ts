import cron from 'node-cron';
import { getContainer } from '../loadModules.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { ZohoTicketStatusService } from '#root/modules/dashboard/services/ZohoTicketStatusService.js';
import { TestersDashboardService } from '#root/modules/dashboard/services/TestersDashboardService.js';

// Runs more often than the 30-min sheet sync since ticket status changes
// matter closer to real-time. Reads the ticket URLs straight from the
// already-synced Testers Dashboard data (the "Defect ID / Bug Ref" links),
// rather than re-fetching the sheet itself.
cron.schedule('1,31 * * * *', async () => {
    console.log('<<CRON>> Running Zoho ticket status sync...');

    try {
        const container = getContainer();
        const zohoTicketStatusService = container.get<ZohoTicketStatusService>(
            CORE_TYPES.ZohoTicketStatusService,
        );
        const testersDashboardService = container.get<TestersDashboardService>(
            CORE_TYPES.TestersDashboardService,
        );

        const { records } = await testersDashboardService.getData();
        const ticketUrls = records
            .map((r) => (r['Defect ID / Bug Ref\nZoho Desk Ticketing'] || '').trim())
            .filter((v) => v.toLowerCase().startsWith('http'));

        await zohoTicketStatusService.syncTicketStatuses(ticketUrls);
    } catch (error) {
        console.error('<<CRON>> Error syncing Zoho ticket statuses:', error);
    }
});