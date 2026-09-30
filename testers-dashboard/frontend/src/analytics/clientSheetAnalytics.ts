import {
    applyFilters,
    buildFilterOptions,
    type TestersDashboardFilters,
} from './filters.js';
import {
    calculateKpis,
    calculatePreviousPeriodStats,
    calculateChannelStats,
    calculateLanguageStats,
} from './kpis.js';
import { calculateDiagnostics } from './diagnostics.js';
import { calculateChartData } from './chartData.js';
import { isFutureTestDate } from './normalize.js';
import { mergeSheetSources, type SheetFetchResult } from './sheetMerge.js';
import type { TestersDashboardRecord, ZohoTicketStatus } from './types.js';
import {
    testersDashboardSummaryService,
    type ITestersDashboardSummaryResponse,
} from '../services/testersDashboardSummaryService.js';

const DB_NAME = 'AjraSakhaTestersAnalytics';
const STORE_NAME = 'sheet_records';
const METADATA_KEY = 'analytics_metadata';

export function parseRawRowsToRecords(
    header: string[],
    rows: (string | number | boolean | null)[][],
): TestersDashboardRecord[] {
    const records: TestersDashboardRecord[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const record: TestersDashboardRecord = {};
        for (let j = 0; j < header.length; j++) {
            record[header[j]] = String(row[j] ?? '');
        }
        const testId = (record['Test ID'] || '').trim();
        if (
            testId &&
            !testId.startsWith('Project:') &&
            !testId.startsWith('Test ID') &&
            !isFutureTestDate(record['Test Date'])
        ) {
            records.push(record);
        }
    }
    return records;
}

let activeSyncPromise: Promise<{ records: TestersDashboardRecord[]; lastSyncedAt: string } | null> | null = null;

export async function syncAndCacheSheetsFromBackend(): Promise<{
    records: TestersDashboardRecord[];
    lastSyncedAt: string;
} | null> {
    if (activeSyncPromise) {
        return activeSyncPromise;
    }

    activeSyncPromise = (async () => {
        try {
            const sourcesRes = await testersDashboardSummaryService.getSheetSources();
            if (!sourcesRes.success || !sourcesRes.sources || sourcesRes.sources.length === 0) {
                console.warn('[clientSheetAnalytics] No sheet sources configured on backend.');
                return null;
            }

            const fetchResults: SheetFetchResult[] = [];
            for (const source of sourcesRes.sources) {
                try {
                    const data = await testersDashboardSummaryService.fetchSheetStream(source.index);
                    const rawRows = data?.values && Array.isArray(data.values) ? data.values : null;
                    fetchResults.push({ label: source.label, rawRows });
                } catch (err) {
                    console.error(`[clientSheetAnalytics] Failed to stream sheet ${source.label}:`, err);
                    fetchResults.push({ label: source.label, rawRows: null });
                }
            }

            const { header, rows, merged } = mergeSheetSources(fetchResults);
            if (!header || merged.length === 0 || rows.length === 0) {
                console.warn('[clientSheetAnalytics] No rows could be merged from sheet sources.');
                return null;
            }

            const records = parseRawRowsToRecords(header, rows);
            const lastSyncedAt = new Date().toISOString();
            await saveRecordsToBrowserStorage(records, lastSyncedAt);
            return { records, lastSyncedAt };
        } catch (err) {
            console.error('[clientSheetAnalytics] Error during sheet sync:', err);
            return null;
        } finally {
            activeSyncPromise = null;
        }
    })();

    return activeSyncPromise;
}

/**
 * Fast client-side CSV parser that handles quotes and multiple lines
 */
export function parseCsvTextToRecords(csvText: string): TestersDashboardRecord[] {
    let text = csvText.trim();
    const headerIndex = text.indexOf('Test ID,');
    if (headerIndex !== -1) {
        text = text.substring(headerIndex);
    }

    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            inQuotes = !inQuotes;
            currentLine += char;
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (currentLine.trim()) {
                lines.push(currentLine);
            }
            currentLine = '';
            if (char === '\r' && text[i + 1] === '\n') {
                i++; // Skip \n in \r\n
            }
        } else {
            currentLine += char;
        }
    }
    if (currentLine.trim()) {
        lines.push(currentLine);
    }

    if (lines.length < 2) return [];

    const parseLine = (line: string): string[] => {
        const result: string[] = [];
        let cur = '';
        let inside = false;
        for (let j = 0; j < line.length; j++) {
            const c = line[j];
            if (c === '"') {
                if (inside && line[j + 1] === '"') {
                    cur += '"';
                    j++;
                } else {
                    inside = !inside;
                }
            } else if (c === ',' && !inside) {
                result.push(cur.trim());
                cur = '';
            } else {
                cur += c;
            }
        }
        result.push(cur.trim());
        return result;
    };

    const headers = parseLine(lines[0]);
    const records: TestersDashboardRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        const record: TestersDashboardRecord = {};
        for (let j = 0; j < headers.length; j++) {
            record[headers[j]] = values[j] || '';
        }

        const testId = (record['Test ID'] || '').trim();
        if (
            testId &&
            !testId.startsWith('Project:') &&
            !testId.startsWith('Test ID') &&
            !isFutureTestDate(record['Test Date'])
        ) {
            records.push(record);
        }
    }

    return records;
}

// ---------------- IndexedDB Persistence (Browser Cache) ----------------

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveRecordsToBrowserStorage(
    records: TestersDashboardRecord[],
    lastSyncedAt: string = new Date().toISOString(),
): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(records, 'records');
        store.put(lastSyncedAt, METADATA_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getRecordsFromBrowserStorage(): Promise<{
    records: TestersDashboardRecord[];
    lastSyncedAt: string | null;
} | null> {
    try {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const recordsReq = store.get('records');
            const metaReq = store.get(METADATA_KEY);

            tx.oncomplete = () => {
                const records = recordsReq.result;
                const lastSyncedAt = metaReq.result || null;
                if (records && Array.isArray(records) && records.length > 0) {
                    resolve({ records, lastSyncedAt });
                } else {
                    resolve(null);
                }
            };
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        return null;
    }
}

export async function clearBrowserStorage(): Promise<void> {
    try {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // Ignore clear errors
    }
}

// ---------------- In-Browser Client-Side Analytics Computation ----------------

export function computeClientSummary(
    allRecords: TestersDashboardRecord[],
    filters: TestersDashboardFilters,
    excludeFailures: boolean,
    customStart: string | undefined,
    customEnd: string | undefined,
    zohoTickets: Record<string, ZohoTicketStatus> = {},
    lastSyncedAt: string | null = null,
): ITestersDashboardSummaryResponse {
    const filteredRows = applyFilters(
        allRecords,
        filters,
        excludeFailures,
        customStart,
        customEnd,
    );

    const kpis = calculateKpis(filteredRows, filters.typeBranch);
    const diagnostics = calculateDiagnostics(filteredRows, zohoTickets);
    const chartData = calculateChartData(filteredRows, undefined, filters.typeBranch);
    const channelStats = calculateChannelStats(filteredRows);
    const languageStats = calculateLanguageStats(filteredRows);
    const previousPeriodStats = calculatePreviousPeriodStats(
        allRecords,
        filters,
        excludeFailures,
        customStart,
        customEnd,
    );
    const filterOptions = buildFilterOptions(allRecords);

    return {
        success: true,
        totalRecords: allRecords.length,
        kpis: kpis as any,
        diagnostics: diagnostics as any,
        chartData: chartData as any,
        previousPeriodStats: previousPeriodStats as any,
        filterOptions,
        lastSyncedAt,
        channelStats: channelStats as any,
        languageStats: languageStats as any,
    };
}
