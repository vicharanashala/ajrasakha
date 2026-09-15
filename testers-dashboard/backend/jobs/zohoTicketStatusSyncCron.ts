import type { TestersDashboardService } from '../services/TestersDashboardService.js';
import type { ZohoTicketStatusService } from '../services/ZohoTicketStatusService.js';

// See testersDashboardSyncCron.ts in this folder for why the cron.schedule(...)
// registration and container lookup stay in backend/src/bootstrap/jobs/ while
// this function holds the actual sync logic.
export async function runZohoTicketStatusSync(
  zohoTicketStatusService: ZohoTicketStatusService,
  testersDashboardService: TestersDashboardService,
): Promise<void> {
  console.log('<<CRON>> Running Zoho ticket status sync...');

  try {
    // Runs more often than the 30-min sheet sync since ticket status changes
    // matter closer to real-time. Reads the ticket URLs straight from the
    // already-synced Testers Dashboard data (the "Defect ID / Bug Ref"
    // links), rather than re-fetching the sheet itself.
    const { records } = await testersDashboardService.getData();
    const ticketUrls = records
      .map((r) => (r['Defect ID / Bug Ref\nZoho Desk Ticketing'] || '').trim())
      .filter((v) => v.toLowerCase().startsWith('http'));

    await zohoTicketStatusService.syncTicketStatuses(ticketUrls);
  } catch (error) {
    console.error('<<CRON>> Error syncing Zoho ticket statuses:', error);
  }
}
