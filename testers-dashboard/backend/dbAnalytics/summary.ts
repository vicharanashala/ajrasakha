// Assembles the Database Logs Analytics summary from two independently
// fetched entry sets - the selected period and, when the date range has one,
// the equal-length previous period (same non-date filters).

import type { ZohoTicketStatus } from '../interfaces/IZohoTicketStatusService.js';
import type { DbFilterOptions } from '../services/dbFilterOptions.js';
import { dbFilterOptionValues } from '../services/dbFilterOptions.js';
import { type Entry, round1 } from './values.js';
import {
    avgResponse,
    calculateDbKpis,
    channelStats,
    criticalDefects,
    languageStats,
    notificationSuccessRate,
    passFail,
    scientificAccuracyRate,
    voiceSuccess,
} from './kpis.js';
import { calculateDbDiagnostics } from './diagnostics.js';
import { calculateDbChartData } from './chartData.js';
import type { DbAnalyticsSummaryResponse, DbPreviousPeriodStats } from './types.js';

// The "vs previous period" figures, from the previous window's own entries.
export function calculateDbPreviousPeriodStats(previous: Entry[], window: { start: string; end: string }): DbPreviousPeriodStats {
    const pf = passFail(previous);
    const defects = criticalDefects(previous);
    return {
        totalTests: previous.length,
        passRate: pf.passRate,
        failRate: pf.failRate,
        avgResponseMinutes: avgResponse(previous).minutes,
        scientificAccuracy: scientificAccuracyRate(previous).value,
        openCriticalDefects: defects.critical + defects.high,
        countCriticalBugs: defects.critical,
        criticalDefectsPct: defects.pct,
        notificationSuccess: notificationSuccessRate(previous).value,
        voiceSuccess: round1(voiceSuccess(previous).score),
        rangeLabel: `${window.start} to ${window.end}`,
    };
}

export function calculateDbSummary(input: {
    current: Entry[];
    previous: { entries: Entry[]; window: { start: string; end: string } } | null;
    typeBranch: string;
    totalRecords: number;
    filterOptions: DbFilterOptions;
    lastSyncedAt: string | null;
    zohoTickets?: Record<string, ZohoTicketStatus>;
}): DbAnalyticsSummaryResponse {
    const { current, previous, typeBranch } = input;
    return {
        success: true,
        calculation: 'db-native',
        totalRecords: input.totalRecords,
        matchedRecords: current.length,
        kpis: calculateDbKpis(current, typeBranch),
        diagnostics: calculateDbDiagnostics(current, input.zohoTickets ?? {}),
        chartData: calculateDbChartData(current, typeBranch),
        previousPeriodStats: previous ? calculateDbPreviousPeriodStats(previous.entries, previous.window) : null,
        filterOptions: dbFilterOptionValues(input.filterOptions),
        dbFilterOptions: input.filterOptions,
        lastSyncedAt: input.lastSyncedAt,
        channelStats: channelStats(current),
        languageStats: languageStats(current),
    };
}
