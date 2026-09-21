import { injectable } from 'inversify';
import {
    IZohoTicketStatusService,
    ZohoTicketStatus,
    ZohoTeam,
    CreateZohoTicketParams,
    CreateZohoTicketResponse,
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
const ZOHO_API_DOMAIN = process.env.ZOHO_API_DOMAIN || 'desk.zoho.in';

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
    private cache: Record<string, ZohoTicketStatus> = {};
    private teamsCache: ZohoTeam[] | null = null;
    private teamsCacheExpiresAt = 0;

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
                // `?include=team` embeds the ticket's Team as {id, name}
                // directly on the response - the dedicated /api/v1/teams
                // resolver endpoint needs a broader OAuth scope than this
                // token has (confirmed: 403 SCOPE_MISMATCH), but this embed
                // works with the ticket-read scope already granted.
                const response = await fetch(
                    `https://${ZOHO_API_DOMAIN}/api/v1/tickets/${ticketId}?include=team`,
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

                const data = (await response.json()) as {
                    id: string;
                    status: string;
                    ticketNumber?: string;
                    team?: { id: string; name: string } | null;
                };
                this.cache[ticketId] = {
                    ticketId,
                    status: data.status,
                    team: data.team?.name ?? null,
                    ticketNumber: data.ticketNumber ?? null,
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

        // Map frontend priority to Zoho Desk layout values
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
        // NOTE: cf and teamId are intentionally patched AFTER attachment upload
        // because setting cf_app_name or teamId immediately triggers Zoho Desk auto-assignment rules,
        // which locks the ticket permissions and prevents attachment uploads from non-team members.

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

                // Detect true OAuth scope mismatch
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
            const portalBase = process.env.ZOHO_PORTAL_URL || 'https://desk.zoho.in/agent/annamai/annam-ai/tickets/details';
            const url = data.webUrl || `${portalBase}/${ticketId}`;
            const status = data.status || 'Open';

            // Upload screenshots / attachments to Zoho Cloud if provided
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

            // Assign owner team and custom fields (cf_app_name, cf_issue_reoccurred_before) after attachments are uploaded.
            // (Setting teamId or cf_app_name initially triggers Zoho Desk auto-assignment rules, which can restrict
            // creator attachment permissions in Zoho Desk profile rules before attachments are uploaded)
            let assignedTeamName = data.team?.name ?? null;
            const patchBody: Record<string, any> = {};
            if (params.teamId && params.teamId.trim()) {
                patchBody.teamId = params.teamId.trim();
            }
            if (Object.keys(cf).length > 0) {
                patchBody.cf = cf;
            }
            // Zoho Desk's internal SLA rules overwrite the initial dueDate on creation with the default SLA time (e.g. 4 or 8 hours).
            // Patching it here ensures the user's chosen deadline is preserved.
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

            // Cache the newly created ticket status immediately
            this.cache[ticketId] = {
                ticketId,
                status,
                team: assignedTeamName,
                ticketNumber,
                lastCheckedAt: new Date().toISOString(),
            };

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