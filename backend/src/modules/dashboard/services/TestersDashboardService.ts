import { injectable } from 'inversify';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import { google } from 'googleapis';
import {
    ITestersDashboardService,
    TestersDashboardDataResponse,
    TestersDashboardRecord,
} from '../interfaces/ITestersDashboardService.js';

// TODO: confirm final location with the team - for now this expects the same
// updated.csv used by outreach_stt/dashboard, copied/synced into this backend.
// Configurable via env so we don't hardcode a path that only exists on one machine.
const CSV_PATH =
    process.env.TESTERS_DASHBOARD_CSV_PATH ||
    path.join(process.cwd(), 'data', 'testers-dashboard', 'updated.csv');

const SHEET_ID = process.env.TESTERS_DASHBOARD_SHEET_ID || '';
const SHEET_TAB = process.env.TESTERS_DASHBOARD_SHEET_TAB || 'Test Log_1';
const SERVICE_ACCOUNT_PATH =
    process.env.TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH || '';

// Wraps a single CSV field in quotes if it contains a comma, quote, or newline,
// and doubles up any internal quotes - standard CSV escaping.
function escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

@injectable()
export class TestersDashboardService implements ITestersDashboardService {
    private cachedRecords: TestersDashboardRecord[] | null = null;

    private parseCSV(filePath: string): Promise<TestersDashboardRecord[]> {
        return new Promise((resolve, reject) => {
            let fileContent: string;
            try {
                fileContent = fs.readFileSync(filePath, 'utf8');
            } catch (err) {
                return reject(err);
            }

            // Same quirk as the original tool: the real header row starts with
            // "Test ID," further down the file, past some boilerplate rows.
            const headerIndex = fileContent.indexOf('Test ID,');
            if (headerIndex !== -1) {
                fileContent = fileContent.substring(headerIndex);
            }

            const results: TestersDashboardRecord[] = [];
            Readable.from([fileContent])
                .pipe(csv())
                .on('data', (data: TestersDashboardRecord) => {
                    const testId = data['Test ID'] ? data['Test ID'].trim() : '';
                    if (
                        testId &&
                        !testId.startsWith('Project:') &&
                        !testId.startsWith('Test ID')
                    ) {
                        results.push(data);
                    }
                })
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }

    async getData(): Promise<TestersDashboardDataResponse> {
        if (!fs.existsSync(CSV_PATH)) {
            return { success: false, totalRecords: 0, records: [], lastSyncedAt: null };
        }

        const records = await this.parseCSV(CSV_PATH);
        this.cachedRecords = records;

        // The file's last-modified time is exactly when the 30-min cron job
        // (syncFromSheet) last overwrote it with fresh data from the Google
        // Sheet - this is genuinely "when did we last sync," not just "when did
        // the browser last ask for data."
        const stats = fs.statSync(CSV_PATH);

        return {
            success: true,
            totalRecords: records.length,
            records,
            lastSyncedAt: stats.mtime.toISOString(),
        };
    }

    async syncFromSheet(): Promise<void> {
        if (!SHEET_ID || !SERVICE_ACCOUNT_PATH) {
            console.warn(
                '[TestersDashboard] Sheet sync skipped - TESTERS_DASHBOARD_SHEET_ID or ' +
                'TESTERS_DASHBOARD_SERVICE_ACCOUNT_PATH not configured.',
            );
            return;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: SHEET_TAB,
        });

        const rows = response.data.values || [];
        if (rows.length === 0) {
            console.warn('[TestersDashboard] Sheet returned no rows, skipping overwrite.');
            return;
        }

        const csvLines = rows.map((row) =>
            row.map((cell) => escapeCsvField(String(cell ?? ''))).join(','),
        );
        const csvContent = csvLines.join('\n');

        const dir = path.dirname(CSV_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CSV_PATH, csvContent, 'utf8');

        console.log(
            `[TestersDashboard] Synced ${rows.length - 1} rows from Google Sheet into updated.csv`,
        );
    }
}
