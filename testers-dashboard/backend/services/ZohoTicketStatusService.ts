import { injectable } from 'inversify';
import {
    IZohoTicketStatusService,
    ZohoTicketStatus,
    ZohoTicketsSnapshot,
    ZohoTeam,
    CreateZohoTicketParams,
    CreateZohoTicketResponse,
} from '../interfaces/IZohoTicketStatusService.js';

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || '';
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN || '';
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID || '';

// Zoho Desk's documented max page size for the ticket list endpoint.
const ZOHO_TICKET_LIST_PAGE_SIZE = 100;

// Safety stop for the paged ticket fetch (500 pages = 50,000 tickets). Hitting
// it is treated as a failed fetch, never as a complete ticket list.
const ZOHO_TICKET_LIST_MAX_PAGES = 500;

// How long one direct fetch of the ticket list is reused for subsequent
// dashboard requests, so a single page load (ticket card + DB summary +
// tester form) shares one paged Zoho fetch instead of each triggering its own.
// Not a sync schedule: the first request after it expires fetches from Zoho
// directly. Override with ZOHO_TICKETS_MAX_AGE_SECONDS.
const parsedMaxAge = Number(process.env.ZOHO_TICKETS_MAX_AGE_SECONDS);
export const ZOHO_TICKETS_MAX_AGE_MS = (Number.isFinite(parsedMaxAge) && parsedMaxAge >= 0 ? parsedMaxAge : 60) * 1000;

// Two SEPARATE domains, both taken directly from what Zoho actually
// returned during the OAuth exchange - not derived/guessed from each other.
// The accounts domain (for token refresh) and the API domain (for actual
// ticket calls) don't follow a predictable naming pattern relative to each
// other, so a string-replace derivation between them silently breaks. Both
// values should be entered WITHOUT "https://" - it's prepended below.
const ZOHO_ACCOUNTS_DOMAIN = process.env.ZOHO_ACCOUNTS_DOMAIN || 'accounts.zoho.in';
const ZOHO_API_DOMAIN = process.env.ZOHO_API_DOMAIN || 'desk.zoho.in';

// The only Zoho Desk ticket layout the ticket card shows - Annam.ai and
// Anveshan are separate products' layouts in the same Zoho org and must be
// excluded at sync time, not just filtered client-side.
//
// Filtered by layoutId, NOT a layout name: Zoho Desk's ticket list endpoint
// only ever returns the raw `layoutId` on each ticket, and both
// `include=layoutDetails`/`include=layout` and the dedicated /api/v1/layouts
// endpoint that would resolve id -> name are blocked for this token (422 /
// 403 SCOPE_MISMATCH). Confirm this ID against Zoho Desk Admin >
// Customization > Layouts (or grant the /layouts OAuth scope) if the org's
// layout IDs ever change.
export const ZOHO_BUGS_TRACKER_LAYOUT_ID = process.env.ZOHO_BUGS_TRACKER_LAYOUT_ID || '202216000001458257';

function isBugsTrackerLayout(layoutId?: string | null): boolean {
    return (layoutId || '').trim() === ZOHO_BUGS_TRACKER_LAYOUT_ID;
}

// Teams whose tickets belong to a different service entirely, not the
// Testers Dashboard, and must never surface on the ticket card in any view
// or count. Excluded here at sync time (not client-side) so a filtered-out
// ticket never enters the cache at all. "Agent Calling Center Team" owns the
// separate ACC service's tickets, which happen to live in the same Zoho org
// and Bugs Tracker layout but are unrelated to testing - add more names here
// if other unrelated teams' tickets turn up the same way.
const EXCLUDED_TEAM_NAMES = new Set(['Agent Calling Center Team']);

function isExcludedTeam(teamName?: string | null): boolean {
    return EXCLUDED_TEAM_NAMES.has((teamName || '').trim());
}

// Single shared mapping from Zoho's `priority` field to the severity label
// the ticket card displays - used for every ticket, so this is the one and
// only severity rule for the ticket card. Both naming styles Zoho tickets
// use ("P1 - High" from tickets created via this app's own createTicket()
// below, plain "High" from tickets created directly in Zoho's UI) map to the
// same severity. Anything else maps to "No priority" rather than being
// dropped; the "All Tickets" view deliberately includes these.
//
// NOT the same thing as normalizeDefectSeverity (normalize.ts), which reads
// the QA sheet's own "Defect Severity" column and feeds the Executive
// Summary's Critical Defects tile - a different metric over a different
// data source, unaffected by this one.
export function mapZohoPriorityToSeverity(priority?: string | null): string {
    const normalized = (priority || '').trim().toLowerCase();
    switch (normalized) {
        case 'p0 - critical':
            return 'Critical';
        case 'p1 - high':
        case 'high':
            return 'High';
        case 'p2 - medium':
        case 'medium':
            return 'Medium';
        case 'p3 - low':
        case 'low':
            return 'Low';
        default:
            return 'No priority';
    }
}

function formatDescriptionToHtml(text: string): string {
    if (!text) return '';
    // If text is already formatted as HTML, pass it through
    if (text.includes('<p>') || text.includes('<br') || text.includes('<div>') || text.includes('<ul>')) {
        return text;
    }

    return text
        .split('\n\n')
        .map((paragraph) => {
            const lines = paragraph
                .split('\n')
                .map((line) => {
                    const trimmed = line.trim();
                    if (!trimmed) return '';
                    if (trimmed.startsWith('---') || trimmed === '----------------') {
                        return '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 4px 0 8px;" />';
                    }
                    const formatted = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    if (formatted.startsWith('### ')) {
                        return `<h3 style="margin: 8px 0 3px; color: #111827; font-size: 15px;">${formatted.slice(4)}</h3>`;
                    }
                    if (formatted.startsWith('## ') || formatted === 'QA Defect Report') {
                        return `<h2 style="margin: 8px 0 4px; color: #111827; font-size: 16px;">${formatted.startsWith('## ') ? formatted.slice(3) : formatted}</h2>`;
                    }
                    if (formatted.startsWith('- ') || formatted.startsWith('• ')) {
                        return `&bull; ${formatted.slice(2)}`;
                    }
                    // If a section title like "Query Tested:" or "Test Case Details:"
                    if (formatted.endsWith(':') && formatted.length < 50) {
                        return `<strong>${formatted}</strong>`;
                    }
                    return formatted;
                })
                .filter(Boolean)
                .join('<br/>');
            return `<p style="margin: 6px 0; line-height: 1.5;">${lines}</p>`;
        })
        .join('');
}

@injectable()
export class ZohoTicketStatusService implements IZohoTicketStatusService {
    private accessToken: string | null = null;
    private accessTokenExpiresAt = 0; // epoch ms
    private inFlightTokenRefresh: Promise<string | null> | null = null;
    // Last successful direct fetch of the Bugs Tracker ticket list.
    private snapshot: { statuses: Record<string, ZohoTicketStatus>; fetchedAtMs: number } | null = null;
    // One paged fetch at a time - concurrent requests share it.
    private inFlightTicketFetch: Promise<ZohoTicketsSnapshot> | null = null;
    private teamsCache: ZohoTeam[] | null = null;
    private teamsCacheExpiresAt = 0;
    private inFlightCreateTickets = new Map<string, Promise<CreateZohoTicketResponse>>();
    private recentCreatedTickets = new Map<string, { result: CreateZohoTicketResponse; timestamp: number }>();

    private isConfigured(): boolean {
        return Boolean(ZOHO_CLIENT_ID && ZOHO_CLIENT_SECRET && ZOHO_REFRESH_TOKEN && ZOHO_ORG_ID);
    }

    private async getAccessToken(): Promise<string | null> {
        if (!this.isConfigured()) {
            console.warn('[ZohoTicketStatus] Not configured - skipping (missing env vars).');
            return null;
        }

        // Zoho access tokens last ~1 hour. Refresh a bit early (55 min) to
        // avoid edge-of-expiry failures mid-sync.
        if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
            return this.accessToken;
        }

        // Concurrent callers (ticket fetch + ticket creation) share one refresh.
        if (!this.inFlightTokenRefresh) {
            this.inFlightTokenRefresh = this.refreshAccessToken().finally(() => {
                this.inFlightTokenRefresh = null;
            });
        }
        return this.inFlightTokenRefresh;
    }

    private async refreshAccessToken(): Promise<string | null> {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            refresh_token: ZOHO_REFRESH_TOKEN,
        });

        const response = await fetch(`https://${ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        if (!response.ok) {
            console.error('[ZohoTicketStatus] Token refresh failed:', response.status, await response.text());
            return null;
        }

        const data = (await response.json()) as { access_token: string; expires_in: number };
        this.accessToken = data.access_token;
        this.accessTokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000; // 5-min safety margin
        return this.accessToken;
    }

    // Ticket's Zoho Desk web URL - Zoho's own `webUrl` when the response
    // includes one, otherwise built from the ticket ID - list-endpoint pages
    // don't reliably include webUrl the way a single ticket-create response
    // does.
    private buildTicketUrl(ticketId: string, webUrl?: string | null): string {
        const portalBase = process.env.ZOHO_PORTAL_URL || 'https://desk.zoho.in/agent/annamai/annam-ai/tickets/details';
        return webUrl || `${portalBase}/${ticketId}`;
    }

    // Pages through Zoho Desk's ticket list endpoint (GET /api/v1/tickets)
    // and returns every Bugs Tracker-layout ticket (see
    // ZOHO_BUGS_TRACKER_LAYOUT_ID above), minus excluded teams. This is the
    // ticket card's ONLY source of tickets - not the QA sheet/CSV's Defect ID
    // / Bug Ref column, since many real tickets (including Critical ones) are
    // never linked there. include=team embeds each ticket's Team as
    // {id, name} directly, since the dedicated /api/v1/teams resolver needs a
    // broader OAuth scope than this token has - `include` accepts only a small
    // fixed set of values for this endpoint; anything else (e.g.
    // `layoutDetails`) is rejected outright with a 422.
    //
    // Throws on any failed page, so a partial list is never mistaken for
    // "all tickets".
    private async fetchAllBugsTrackerTickets(token: string): Promise<Record<string, ZohoTicketStatus>> {
        const statuses: Record<string, ZohoTicketStatus> = {};
        let from = 0;
        let totalFetched = 0;

        // "Last page" is signalled by a page shorter than the requested
        // limit (or an empty 204 response) - Zoho's ticket list endpoint
        // doesn't return a reliable upfront total count.
        for (let pageIndex = 0; ; pageIndex++) {
            if (pageIndex >= ZOHO_TICKET_LIST_MAX_PAGES) {
                throw new Error(`Ticket list exceeded ${ZOHO_TICKET_LIST_MAX_PAGES} pages - stopping rather than returning a partial list.`);
            }
            const response = await fetch(
                `https://${ZOHO_API_DOMAIN}/api/v1/tickets?include=team&from=${from}&limit=${ZOHO_TICKET_LIST_PAGE_SIZE}`,
                {
                    headers: {
                        Authorization: `Zoho-oauthtoken ${token}`,
                        orgId: ZOHO_ORG_ID,
                    },
                },
            );

            if (!response.ok) {
                if (response.status === 401) this.accessToken = null;
                const errorBody = await response.text();
                throw new Error(`Failed to fetch tickets at offset ${from}: ${response.status} - ${errorBody}`);
            }

            const page =
                response.status === 204
                    ? {}
                    : ((await response.json()) as {
                          data?: {
                              id: string;
                              status: string;
                              priority?: string | null;
                              ticketNumber?: string;
                              webUrl?: string;
                              layoutId?: string | null;
                              team?: { id: string; name: string } | null;
                          }[];
                      });
            const tickets = page.data ?? [];
            totalFetched += tickets.length;
            const checkedAt = new Date().toISOString();

            tickets.forEach((t) => {
                if (!isBugsTrackerLayout(t.layoutId)) return;
                if (isExcludedTeam(t.team?.name)) return;
                const ticketId = String(t.id);
                const priority = t.priority ?? null;
                statuses[ticketId] = {
                    ticketId,
                    status: t.status,
                    team: t.team?.name ?? null,
                    ticketNumber: t.ticketNumber ? String(t.ticketNumber) : null,
                    priority,
                    severity: mapZohoPriorityToSeverity(priority),
                    url: this.buildTicketUrl(ticketId, t.webUrl),
                    lastCheckedAt: checkedAt,
                };
            });

            if (tickets.length < ZOHO_TICKET_LIST_PAGE_SIZE) break;
            from += ZOHO_TICKET_LIST_PAGE_SIZE;
        }

        console.log(
            `[ZohoTicketStatus] Fetched ${Object.keys(statuses).length} Bugs Tracker ticket(s) (of ${totalFetched} total across all layouts).`,
        );
        return statuses;
    }

    private snapshotResult(stale: boolean, error?: string): ZohoTicketsSnapshot {
        return {
            configured: true,
            statuses: this.snapshot?.statuses ?? {},
            fetchedAt: this.snapshot ? new Date(this.snapshot.fetchedAtMs).toISOString() : null,
            stale,
            ...(error ? { error } : {}),
        };
    }

    // Current Bugs Tracker tickets, fetched directly from Zoho on request -
    // no scheduled sync involved. A fetch completed within the last
    // `maxAgeMs` (default ZOHO_TICKETS_MAX_AGE_MS) is reused, and concurrent
    // callers share one in-flight fetch. If Zoho can't be reached, the last
    // successful fetch is returned marked `stale` (empty if there is none).
    async getTicketStatuses(options: { maxAgeMs?: number } = {}): Promise<ZohoTicketsSnapshot> {
        if (!this.isConfigured()) {
            return { configured: false, statuses: {}, fetchedAt: null, stale: false, error: 'Zoho Desk is not configured.' };
        }
        const maxAgeMs = options.maxAgeMs ?? ZOHO_TICKETS_MAX_AGE_MS;
        if (this.snapshot && Date.now() - this.snapshot.fetchedAtMs < maxAgeMs) {
            return this.snapshotResult(false);
        }
        if (!this.inFlightTicketFetch) {
            this.inFlightTicketFetch = this.fetchTicketSnapshot().finally(() => {
                this.inFlightTicketFetch = null;
            });
        }
        return this.inFlightTicketFetch;
    }

    private async fetchTicketSnapshot(): Promise<ZohoTicketsSnapshot> {
        try {
            const token = await this.getAccessToken();
            if (!token) return this.snapshotResult(this.snapshot !== null, 'Zoho authentication failed.');
            const statuses = await this.fetchAllBugsTrackerTickets(token);
            this.snapshot = { statuses, fetchedAtMs: Date.now() };
            return this.snapshotResult(false);
        } catch (err: any) {
            console.error('[ZohoTicketStatus] Error fetching Bugs Tracker tickets:', err);
            return this.snapshotResult(this.snapshot !== null, err?.message || 'Failed to fetch Zoho tickets.');
        }
    }

    async getTeams(): Promise<ZohoTeam[]> {
        if (this.teamsCache && Date.now() < this.teamsCacheExpiresAt) {
            return this.teamsCache;
        }

        const token = await this.getAccessToken();
        if (!token) return [];

        try {
            const response = await fetch(`https://${ZOHO_API_DOMAIN}/api/v1/teams`, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${token}`,
                    orgId: ZOHO_ORG_ID,
                },
            });

            if (!response.ok) {
                console.warn(`[ZohoTicketStatus] Failed to fetch teams: ${response.status}`);
                return [];
            }

            const data = (await response.json()) as { teams?: { id: string; name: string }[] };
            if (data?.teams && Array.isArray(data.teams)) {
                const excludedNames = ['hackathon team', 'vibe team'];
                this.teamsCache = data.teams
                    .filter((t) => !excludedNames.includes(t.name.trim().toLowerCase()))
                    .map((t) => ({ id: String(t.id), name: t.name }));
                this.teamsCacheExpiresAt = Date.now() + 60 * 60 * 1000; // 1 hour cache
                return this.teamsCache;
            }
            return [];
        } catch (err) {
            console.error('[ZohoTicketStatus] Error fetching teams:', err);
            return [];
        }
    }

    async createTicket(params: CreateZohoTicketParams): Promise<CreateZohoTicketResponse> {
        const dedupeKey = `${(params.subject || '').trim()}|${(params.email || '').trim()}|${(params.appName || '').trim()}|${(params.description || '').trim().slice(0, 150)}`;

        const now = Date.now();
        const recent = this.recentCreatedTickets.get(dedupeKey);
        if (recent && now - recent.timestamp < 30000 && recent.result.success) {
            console.warn(`[ZohoTicketStatus] Duplicate ticket creation request detected within 30s for "${params.subject}". Returning cached ticket.`);
            return recent.result;
        }

        const existingPromise = this.inFlightCreateTickets.get(dedupeKey);
        if (existingPromise) {
            console.warn(`[ZohoTicketStatus] Concurrent ticket creation already in-flight for "${params.subject}". Reusing in-flight request.`);
            return existingPromise;
        }

        const createPromise = this.executeCreateTicket(params);
        this.inFlightCreateTickets.set(dedupeKey, createPromise);

        try {
            const result = await createPromise;
            if (result.success) {
                this.recentCreatedTickets.set(dedupeKey, { result, timestamp: Date.now() });
                for (const [key, item] of this.recentCreatedTickets.entries()) {
                    if (Date.now() - item.timestamp > 120000) {
                        this.recentCreatedTickets.delete(key);
                    }
                }
            }
            return result;
        } finally {
            this.inFlightCreateTickets.delete(dedupeKey);
        }
    }

    private async executeCreateTicket(params: CreateZohoTicketParams): Promise<CreateZohoTicketResponse> {
        const token = await this.getAccessToken();
        if (!token) {
            return {
                success: false,
                error: 'Zoho Desk is not configured or authentication failed. Check server environment variables.',
            };
        }

        const departmentId = params.departmentId || process.env.ZOHO_DEPARTMENT_ID || '202216000000010772';
        const contactLastName = (params.testerName || 'QA Tester').trim();
        const contactEmail = (params.email || 'tester@annamai.org').trim();

        const rawPriority = (params.priority || 'Medium').trim();
        let zohoPriority = 'P2 - Medium';
        const pLower = rawPriority.toLowerCase();
        if (pLower.includes('p0') || pLower.includes('urgent') || pLower.includes('critical') || pLower.includes('blocker')) {
            zohoPriority = 'P0 - Critical';
        } else if (pLower.includes('p1') || pLower.includes('high') || pLower.includes('major')) {
            zohoPriority = 'P1 - High';
        } else if (pLower.includes('p3') || pLower.includes('low') || pLower.includes('trivial')) {
            zohoPriority = 'P3 - Low';
        } else if (pLower.includes('p2') || pLower.includes('medium')) {
            zohoPriority = 'P2 - Medium';
        }

        let descriptionHtml = formatDescriptionToHtml(params.description);
        if (params.attachments && Array.isArray(params.attachments) && params.attachments.length > 0) {
            const MAX_ZOHO_DESC_LEN = 62000; // Zoho Desk character limit is 65,535; leave a safe buffer
            let inlineCount = 0;
            let inlineImagesHtml = '';

            for (let i = 0; i < params.attachments.length; i++) {
                if (inlineCount >= 2) break; // Embed at most 2 screenshots directly in description
                const att = params.attachments[i];
                const imgData = att.inlineBase64;
                if (!imgData) continue;

                const singleImgHtml = `<p style="margin: 8px 0 4px;"><strong>Screenshot ${inlineCount + 1}${att.filename ? ` (${att.filename})` : ''}:</strong></p><p style="margin: 4px 0 10px;"><img src="data:image/jpeg;base64,${imgData}" style="max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px;" alt="${att.filename || `Screenshot ${inlineCount + 1}`}" /></p>`;

                if ((descriptionHtml + inlineImagesHtml + singleImgHtml).length < MAX_ZOHO_DESC_LEN) {
                    inlineImagesHtml += singleImgHtml;
                    inlineCount++;
                } else {
                    break;
                }
            }

            if (inlineCount > 0) {
                descriptionHtml += `<br/><hr style="border: none; border-top: 1px solid #e5e7eb; margin: 12px 0 8px;" /><h3 style="margin: 8px 0 4px; color: #111827; font-size: 14px;">Inline Screenshots (${inlineCount}):</h3>${inlineImagesHtml}`;
            }

            const attList = params.attachments
                .map((a) => `&bull; ${a.filename || 'screenshot.png'}`)
                .join('<br/>');
            const summaryHtml = `<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 12px 0 8px;" /><p style="margin: 6px 0; line-height: 1.5;"><strong>All Attachments (${params.attachments.length}):</strong><br/>${attList}<br/><em style="font-size: 11px; color: #6b7280;">(Full-resolution original files are available in the Zoho Desk Attachments tab)</em></p>`;

            if ((descriptionHtml + summaryHtml).length < MAX_ZOHO_DESC_LEN) {
                descriptionHtml += summaryHtml;
            }
        }

        const ticketPayload: Record<string, any> = {
            subject: params.subject,
            description: descriptionHtml,
            departmentId,
            priority: zohoPriority,
            contact: {
                lastName: contactLastName,
                email: contactEmail,
            },
        };

        let formattedDueDateIso: string | null = null;
        if (params.dueDate && params.dueDate.trim()) {
            const raw = params.dueDate.trim();
            const d = new Date(raw);
            if (!isNaN(d.getTime())) {
                // If user selected a plain date like "YYYY-MM-DD", set time to end of day IST (23:59:59 IST = 18:29:59 UTC)
                // A plain "YYYY-MM-DD" date sets time to end of day IST
                // (23:59:59 IST = 18:29:59 UTC).
                if (raw.length === 10) {
                    d.setUTCHours(18, 29, 59, 999);
                }
                formattedDueDateIso = d.toISOString();
                ticketPayload.dueDate = formattedDueDateIso;
            }
        }

        const cf: Record<string, any> = {};
        if (params.appName && params.appName.trim()) {
            cf.cf_app_name = params.appName.trim();
        }
        if (typeof params.issueReoccurredBefore === 'boolean') {
            cf.cf_issue_reoccurred_before = params.issueReoccurredBefore;
        }
        // cf and teamId are intentionally patched AFTER attachment upload:
        // setting them immediately triggers Zoho Desk auto-assignment rules,
        // which lock ticket permissions and block attachment uploads from
        // non-team members. Do not move this patch earlier.

        try {
            const response = await fetch(`https://${ZOHO_API_DOMAIN}/api/v1/tickets`, {
                method: 'POST',
                headers: {
                    Authorization: `Zoho-oauthtoken ${token}`,
                    orgId: ZOHO_ORG_ID,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(ticketPayload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[ZohoTicketStatus] Ticket creation failed: ${response.status} - ${errorText}`);

                const isScopeError =
                    errorText.toLowerCase().includes('scope') ||
                    errorText.toLowerCase().includes('oauth_scope_mismatch');

                if (isScopeError) {
                    return {
                        success: false,
                        requiresScopeUpgrade: true,
                        error: 'Zoho Desk OAuth token requires write permission (Desk.tickets.CREATE or Desk.tickets.ALL).',
                    };
                }

                if (response.status === 401) {
                    this.accessToken = null;
                    return {
                        success: false,
                        error: 'Zoho authentication session expired. Please retry in a moment.',
                    };
                }

                return {
                    success: false,
                    error: `Zoho Desk API error (${response.status}): ${errorText}`,
                };
            }

            const data = (await response.json()) as {
                id: string;
                ticketNumber?: string;
                status?: string;
                webUrl?: string;
                team?: { name: string } | null;
            };

            const ticketId = String(data.id);
            const ticketNumber = data.ticketNumber ? String(data.ticketNumber) : null;
            const url = this.buildTicketUrl(ticketId, data.webUrl);
            const status = data.status || 'Open';

            let attachmentsUploaded = 0;
            if (params.attachments && Array.isArray(params.attachments) && params.attachments.length > 0) {
                for (const att of params.attachments) {
                    if (!att.contentBase64) continue;
                    try {
                        const buffer = Buffer.from(att.contentBase64, 'base64');
                        const blob = new Blob([buffer], { type: att.contentType || 'image/png' });
                        const formData = new FormData();
                        formData.append('file', blob, att.filename || 'screenshot.png');

                        const attachRes = await fetch(`https://${ZOHO_API_DOMAIN}/api/v1/tickets/${ticketId}/attachments`, {
                            method: 'POST',
                            headers: {
                                Authorization: `Zoho-oauthtoken ${token}`,
                                orgId: ZOHO_ORG_ID,
                            },
                            body: formData,
                        });

                        if (attachRes.ok) {
                            attachmentsUploaded++;
                        } else {
                            const errText = await attachRes.text();
                            console.warn(`[ZohoTicketStatus] Failed to upload attachment ${att.filename}: ${attachRes.status} - ${errText}`);
                        }
                    } catch (attErr) {
                        console.error(`[ZohoTicketStatus] Error uploading attachment ${att.filename}:`, attErr);
                    }
                }
            }

            let assignedTeamName = data.team?.name ?? null;
            const patchBody: Record<string, any> = {};
            if (params.teamId && params.teamId.trim()) {
                patchBody.teamId = params.teamId.trim();
            }
            if (Object.keys(cf).length > 0) {
                patchBody.cf = cf;
            }
            // Zoho Desk's internal SLA rules overwrite the initial dueDate on
            // creation with the default SLA time - patching it here ensures
            // the user's chosen deadline is preserved.
            if (formattedDueDateIso) {
                patchBody.dueDate = formattedDueDateIso;
            }

            if (Object.keys(patchBody).length > 0) {
                try {
                    const patchRes = await fetch(`https://${ZOHO_API_DOMAIN}/api/v1/tickets/${ticketId}`, {
                        method: 'PATCH',
                        headers: {
                            Authorization: `Zoho-oauthtoken ${token}`,
                            orgId: ZOHO_ORG_ID,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(patchBody),
                    });
                    if (patchRes.ok) {
                        const patchData = (await patchRes.json()) as { team?: { name: string } };
                        if (patchData?.team?.name) {
                            assignedTeamName = patchData.team.name;
                        } else if (params.teamId) {
                            const cachedTeam = this.teamsCache?.find(t => t.id === params.teamId?.trim());
                            if (cachedTeam) assignedTeamName = cachedTeam.name;
                        }
                    } else {
                        const patchErr = await patchRes.text();
                        console.warn(`[ZohoTicketStatus] Failed to patch teamId/cf on ticket ${ticketId}: ${patchRes.status} - ${patchErr}`);
                    }
                } catch (patchErr) {
                    console.error('[ZohoTicketStatus] Error patching team/cf on ticket:', patchErr);
                }
            }

            // Add the new ticket to the current ticket snapshot right away -
            // same priority->severity mapping as the ticket list fetch - so
            // it shows on the ticket card before that snapshot is next
            // refetched from Zoho (which will include it anyway).
            if (this.snapshot) {
                this.snapshot.statuses[ticketId] = {
                    ticketId,
                    status,
                    team: assignedTeamName,
                    ticketNumber,
                    priority: zohoPriority,
                    severity: mapZohoPriorityToSeverity(zohoPriority),
                    url,
                    lastCheckedAt: new Date().toISOString(),
                };
            }

            return {
                success: true,
                ticket: {
                    ticketId,
                    ticketNumber,
                    url,
                    status,
                    attachmentsUploaded,
                },
            };
        } catch (err: any) {
            console.error('[ZohoTicketStatus] Unexpected error creating ticket:', err);
            return {
                success: false,
                error: err?.message || 'Unexpected network error connecting to Zoho Desk.',
            };
        }
    }
}