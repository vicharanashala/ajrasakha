import { injectable } from 'inversify';
import {
    IZohoTicketStatusService,
    ZohoTicketStatus,
} from '../interfaces/IZohoTicketStatusService.js';

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || '';
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN || '';
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID || '';

// Two SEPARATE domains, both taken directly from what Zoho actually
// returned during the OAuth exchange - not derived/guessed from each
// other. The accounts domain (for token refresh) and the API domain (for
// actual ticket calls) don't follow a predictable naming pattern relative
// to each other (confirmed: real api_domain was "www.zohoapis.in", not
// "desk.zoho.in" as originally assumed - a string-replace derivation
// between them silently breaks). Both values should be entered WITHOUT
// "https://" - it's prepended below.
const ZOHO_ACCOUNTS_DOMAIN = process.env.ZOHO_ACCOUNTS_DOMAIN || 'accounts.zoho.in';
const ZOHO_API_DOMAIN = process.env.ZOHO_API_DOMAIN || 'www.zohoapis.in';

@injectable()
export class ZohoTicketStatusService implements IZohoTicketStatusService {
    private accessToken: string | null = null;
    private accessTokenExpiresAt = 0; // epoch ms
    private cache: Record<string, ZohoTicketStatus> = {};

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

    // Extracts the numeric Zoho ticket ID from a full ticket URL, e.g.
    // ".../tickets/details/202216000001768123" -> "202216000001768123".
    // Matches the same extraction logic already used on the frontend for
    // the "Ticket #..." display label.
    private extractTicketId(urlOrId: string): string {
        const trimmed = urlOrId.trim();
        const parts = trimmed.split('/');
        return parts[parts.length - 1] || trimmed;
    }

    async syncTicketStatuses(ticketIdsOrUrls: string[]): Promise<void> {
        const token = await this.getAccessToken();
        if (!token) return;

        const uniqueIds = Array.from(new Set(ticketIdsOrUrls.map((t) => this.extractTicketId(t))));

        // Sequential, not parallel - this list is small (confirmed ~11-12
        // tickets currently have a linked URL at all), and sequential calls
        // are gentler on Zoho's rate limits than firing them all at once.
        for (const ticketId of uniqueIds) {
            try {
                const response = await fetch(
                    `https://${ZOHO_API_DOMAIN}/api/v1/tickets/${ticketId}`,
                    {
                        headers: {
                            Authorization: `Zoho-oauthtoken ${token}`,
                            orgId: ZOHO_ORG_ID,
                        },
                    },
                );

                if (!response.ok) {
                    const errorBody = await response.text();
                    console.warn(
                        `[ZohoTicketStatus] Failed to fetch ticket ${ticketId}: ${response.status} - ${errorBody}`,
                    );
                    continue;
                }

                const data = (await response.json()) as { id: string; status: string };
                this.cache[ticketId] = {
                    ticketId,
                    status: data.status,
                    lastCheckedAt: new Date().toISOString(),
                };
            } catch (err) {
                console.error(`[ZohoTicketStatus] Error fetching ticket ${ticketId}:`, err);
            }
        }

        console.log(`[ZohoTicketStatus] Synced status for ${uniqueIds.length} ticket(s).`);
        
    }

    getCachedStatuses(): Record<string, ZohoTicketStatus> {
        return this.cache;
    }
}