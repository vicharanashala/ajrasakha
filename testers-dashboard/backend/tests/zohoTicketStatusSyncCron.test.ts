import { describe, it, expect, vi } from 'vitest';
import { runZohoTicketStatusSync } from '../jobs/zohoTicketStatusSyncCron.js';
import type { ZohoTicketStatusService } from '../services/ZohoTicketStatusService.js';

// The ticket card's source of truth is now Zoho's own ticket list (paged,
// filtered to the Bugs Tracker layout, see ZohoTicketStatusService.test.ts
// for that logic) - this cron no longer reads the sheet's "Defect ID / Bug
// Ref" links at all, so there's nothing left to flatten/dedupe here. This
// file now only verifies the thin wiring: the cron calls
// syncAllBugsTrackerTickets() and doesn't throw if it rejects.
function makeService() {
    const syncAllBugsTrackerTickets = vi.fn().mockResolvedValue(undefined);
    const zohoTicketStatusService = { syncAllBugsTrackerTickets } as unknown as ZohoTicketStatusService;
    return { zohoTicketStatusService, syncAllBugsTrackerTickets };
}

describe('runZohoTicketStatusSync', () => {
    it('calls syncAllBugsTrackerTickets with no arguments', async () => {
        const { zohoTicketStatusService, syncAllBugsTrackerTickets } = makeService();

        await runZohoTicketStatusSync(zohoTicketStatusService);

        expect(syncAllBugsTrackerTickets).toHaveBeenCalledTimes(1);
        expect(syncAllBugsTrackerTickets).toHaveBeenCalledWith();
    });

    it('does not throw when syncAllBugsTrackerTickets rejects', async () => {
        const zohoTicketStatusService = {
            syncAllBugsTrackerTickets: vi.fn().mockRejectedValue(new Error('Zoho is down')),
        } as unknown as ZohoTicketStatusService;

        await expect(runZohoTicketStatusSync(zohoTicketStatusService)).resolves.toBeUndefined();
    });
});
