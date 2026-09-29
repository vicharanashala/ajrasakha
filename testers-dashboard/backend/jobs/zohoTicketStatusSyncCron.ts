import type { ZohoTicketStatusService } from '../services/ZohoTicketStatusService.js';

// See testersDashboardSyncCron.ts in this folder for why the cron.schedule(...) registration
// and container lookup stay in backend/src/bootstrap/jobs/ while this function holds the
// actual sync logic. The ticket card's source of truth is Zoho's own ticket list (paged,
// filtered to the Bugs Tracker layout), not the sheet's "Defect ID / Bug Ref" links.
export async function runZohoTicketStatusSync(
  zohoTicketStatusService: ZohoTicketStatusService,
): Promise<void> {
  console.log('<<CRON>> Running Zoho ticket status sync...');

  try {
    // Runs more often than the sheet sync since ticket status changes matter closer to real-time.
    await zohoTicketStatusService.syncAllBugsTrackerTickets();
  } catch (error) {
    console.error('<<CRON>> Error syncing Zoho ticket statuses:', error);
  }
}
